
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.kb_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  source text,
  crop text,
  region text,
  language text NOT NULL DEFAULT 'en',
  storage_path text,
  page_count integer,
  chunk_count integer NOT NULL DEFAULT 0,
  model_version text NOT NULL DEFAULT 'google/gemini-embedding-2',
  uploaded_by uuid,
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kb_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.kb_documents(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  token_count integer,
  embedding vector(3072),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  model_version text NOT NULL DEFAULT 'google/gemini-embedding-2',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kb_chunks_document_idx ON public.kb_chunks(document_id);
CREATE INDEX IF NOT EXISTS kb_chunks_embedding_hnsw_idx
  ON public.kb_chunks USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);

CREATE TABLE IF NOT EXISTS public.kb_query_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  query text,
  top_chunk_ids uuid[],
  top_similarity double precision,
  filter_crop text,
  filter_region text,
  filter_language text,
  surface text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.kb_documents TO authenticated;
GRANT SELECT ON public.kb_chunks TO authenticated;
GRANT ALL ON public.kb_documents TO service_role;
GRANT ALL ON public.kb_chunks TO service_role;
GRANT ALL ON public.kb_query_log TO service_role;

ALTER TABLE public.kb_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_query_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb_documents authenticated read"
  ON public.kb_documents FOR SELECT TO authenticated USING (true);

CREATE POLICY "kb_documents admin write"
  ON public.kb_documents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "kb_chunks authenticated read"
  ON public.kb_chunks FOR SELECT TO authenticated USING (true);

CREATE POLICY "kb_chunks admin write"
  ON public.kb_chunks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "kb_query_log service only"
  ON public.kb_query_log FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.match_kb_chunks(
  query_embedding vector(3072),
  match_count integer DEFAULT 5,
  filter_crop text DEFAULT NULL,
  filter_region text DEFAULT NULL,
  filter_language text DEFAULT NULL,
  min_similarity double precision DEFAULT 0.0
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  title text,
  source text,
  crop text,
  region text,
  language text,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id, c.document_id, c.content, c.metadata,
    d.title, d.source, d.crop, d.region, d.language,
    1 - (c.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)) AS similarity
  FROM public.kb_chunks c
  JOIN public.kb_documents d ON d.id = c.document_id
  WHERE c.embedding IS NOT NULL
    AND (filter_crop IS NULL OR d.crop IS NULL OR d.crop = filter_crop)
    AND (filter_region IS NULL OR d.region IS NULL OR d.region = filter_region)
    AND (filter_language IS NULL OR d.language = filter_language)
    AND (1 - (c.embedding::halfvec(3072) <=> query_embedding::halfvec(3072))) >= min_similarity
  ORDER BY c.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_kb_chunks(vector, integer, text, text, text, double precision) TO authenticated, service_role;
