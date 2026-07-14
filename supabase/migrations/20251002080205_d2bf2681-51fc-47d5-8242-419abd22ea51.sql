-- Add missing insert policy for mbare_price_history
CREATE POLICY "Admins can insert mbare historical prices"
  ON public.mbare_price_history
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );