// Shared RAG retrieval helper for Mudhumeni Hungwe.
// Embeds a query via Lovable AI Gateway (google/gemini-embedding-2, 3072-dim)
// and calls the match_kb_chunks RPC on Supabase. Returns formatted excerpts
// ready to inject into a system prompt.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface KbChunk {
  chunk_id: string;
  document_id: string;
  content: string;
  metadata: Record<string, unknown>;
  title: string;
  source: string | null;
  crop: string | null;
  region: string | null;
  language: string | null;
  similarity: number;
}

export interface KbRetrieveOptions {
  query: string;
  matchCount?: number;
  minSimilarity?: number;
  filterCrop?: string | null;
  filterRegion?: string | null;
  filterLanguage?: string | null;
  surface?: string;
  userId?: string | null;
}

export async function embedQuery(query: string): Promise<number[] | null> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-embedding-2",
        input: query.slice(0, 8000),
      }),
    });
    if (!res.ok) {
      console.error("[kb] embed failed:", res.status, await res.text());
      return null;
    }
    const json = await res.json();
    const vec = json?.data?.[0]?.embedding;
    return Array.isArray(vec) ? vec : null;
  } catch (err) {
    console.error("[kb] embed error:", err);
    return null;
  }
}

export async function retrieveKbChunks(
  opts: KbRetrieveOptions,
): Promise<KbChunk[]> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const embedding = await embedQuery(opts.query);
  if (!embedding) return [];

  const { data, error } = await supabase.rpc("match_kb_chunks", {
    query_embedding: embedding as unknown as string,
    match_count: opts.matchCount ?? 5,
    filter_crop: opts.filterCrop ?? null,
    filter_region: opts.filterRegion ?? null,
    filter_language: opts.filterLanguage ?? null,
    min_similarity: opts.minSimilarity ?? 0.55,
  });

  if (error) {
    console.error("[kb] match_kb_chunks failed:", error);
    return [];
  }
  const chunks = (data ?? []) as KbChunk[];

  // Fire-and-forget query log
  if (chunks.length) {
    supabase.from("kb_query_log").insert({
      user_id: opts.userId ?? null,
      query: opts.query.slice(0, 500),
      top_chunk_ids: chunks.map((c) => c.chunk_id),
      top_similarity: chunks[0]?.similarity ?? null,
      filter_crop: opts.filterCrop ?? null,
      filter_region: opts.filterRegion ?? null,
      filter_language: opts.filterLanguage ?? null,
      surface: opts.surface ?? null,
    }).then(() => {}, () => {});
  }

  return chunks;
}

export function formatChunksForPrompt(chunks: KbChunk[]): string {
  if (!chunks.length) return "";
  const blocks = chunks.map((c, i) => {
    const page = (c.metadata as any)?.page_number;
    const heading = (c.metadata as any)?.heading;
    const cite = [c.title, page ? `p.${page}` : null, heading]
      .filter(Boolean)
      .join(" · ");
    return `[${i + 1}] Source: ${cite}\n${c.content.trim()}`;
  });
  return `\n\nKNOWLEDGE BASE EXCERPTS (local farm guides — prefer these over general knowledge when relevant; cite the source title in parentheses when you rely on one):\n\n${blocks.join("\n\n---\n\n")}\n`;
}
