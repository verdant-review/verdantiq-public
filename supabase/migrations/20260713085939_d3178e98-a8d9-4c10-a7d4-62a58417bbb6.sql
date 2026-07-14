
ALTER TABLE public.mbare_market_prices
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual';

CREATE TABLE IF NOT EXISTS public.mbare_price_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  price_id uuid,
  action text NOT NULL CHECK (action IN ('insert','update','delete')),
  actor_id uuid,
  actor_role text,
  source_type text,
  item text,
  before jsonb,
  after jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.mbare_price_audit TO authenticated;
GRANT ALL ON public.mbare_price_audit TO service_role;

ALTER TABLE public.mbare_price_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read audit log" ON public.mbare_price_audit;
CREATE POLICY "Admins can read audit log"
  ON public.mbare_price_audit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS mbare_price_audit_created_at_idx
  ON public.mbare_price_audit (created_at DESC);

CREATE OR REPLACE FUNCTION public.mbare_price_audit_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_role text;
BEGIN
  v_actor := auth.uid();
  BEGIN
    SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = v_actor LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_role := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.mbare_price_audit (price_id, action, actor_id, actor_role, source_type, item, before, after)
    VALUES (NEW.id, 'insert', v_actor, v_role, NEW.source_type, NEW.item, NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.mbare_price_audit (price_id, action, actor_id, actor_role, source_type, item, before, after)
    VALUES (NEW.id, 'update', v_actor, v_role, NEW.source_type, NEW.item, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.mbare_price_audit (price_id, action, actor_id, actor_role, source_type, item, before, after)
    VALUES (OLD.id, 'delete', v_actor, v_role, OLD.source_type, OLD.item, to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS mbare_price_audit_trg ON public.mbare_market_prices;
CREATE TRIGGER mbare_price_audit_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.mbare_market_prices
  FOR EACH ROW EXECUTE FUNCTION public.mbare_price_audit_fn();

DO $$
BEGIN
  PERFORM cron.unschedule('zimpricecheck-daily-scrape');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DELETE FROM public.service_components
 WHERE slug IN ('market-scraper','zimpricecheck-scraper');
