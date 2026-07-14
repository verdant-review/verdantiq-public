// Admin-only PDF ingestion for the Mudhumeni Hungwe knowledge base.
// Accepts a PDF (base64), parses text page-by-page, chunks, embeds via
// google/gemini-embedding-2, and stores everything in kb_documents / kb_chunks.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// deno-lint-ignore no-explicit-any
import getDocument from "https://esm.sh/pdfjs-serverless@0.5.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const EMBED_MODEL = "google/gemini-embedding-2";
const CHUNK_TARGET_CHARS = 3200; // ~800 tokens
const CHUNK_OVERLAP_CHARS = 400;
const EMBED_BATCH = 100;

interface IngestBody {
  title: string;
  source?: string;
  crop?: string | null;
  region?: string | null;
  language?: string;
  tags?: string[];
  notes?: string;
  file_base64: string; // raw PDF bytes as base64
  filename?: string;
}

function decodeBase64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:.*;base64,/, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function extractPdfPages(bytes: Uint8Array): Promise<string[]> {
  // pdfjs-serverless works in Deno without DOM/canvas.
  // deno-lint-ignore no-explicit-any
  const loadingTask = (getDocument as any)({ data: bytes, useSystemFonts: true });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const text = (content.items as { str: string }[])
      .map((it) => it.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push(text);
  }
  return pages;
}

interface Chunk {
  content: string;
  page_number: number;
  heading?: string;
}

function chunkPages(pages: string[]): Chunk[] {
  const chunks: Chunk[] = [];
  pages.forEach((text, idx) => {
    if (!text) return;
    const pageNum = idx + 1;
    if (text.length <= CHUNK_TARGET_CHARS) {
      chunks.push({ content: text, page_number: pageNum });
      return;
    }
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + CHUNK_TARGET_CHARS, text.length);
      // Snap to nearest sentence boundary when possible
      let cut = end;
      if (end < text.length) {
        const window = text.slice(start, end);
        const lastPeriod = Math.max(
          window.lastIndexOf(". "),
          window.lastIndexOf("? "),
          window.lastIndexOf("! "),
        );
        if (lastPeriod > CHUNK_TARGET_CHARS * 0.6) {
          cut = start + lastPeriod + 1;
        }
      }
      chunks.push({ content: text.slice(start, cut).trim(), page_number: pageNum });
      if (cut >= text.length) break;
      start = Math.max(cut - CHUNK_OVERLAP_CHARS, cut);
    }
  });
  return chunks;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY not configured");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Embedding failed (${res.status}): ${errText}`);
  }
  const json = await res.json();
  const arr = (json?.data ?? []) as { index: number; embedding: number[] }[];
  arr.sort((a, b) => a.index - b.index);
  return arr.map((r) => r.embedding);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    if (url.searchParams.get("healthcheck") === "1") {
      return new Response(JSON.stringify({ ok: true, fn: "kb-ingest-pdf" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (_) { /* noop */ }

  try {
    // Verify caller identity and admin role
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as IngestBody;
    if (!body?.title || !body?.file_base64) {
      return new Response(
        JSON.stringify({ error: "title and file_base64 required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const bytes = decodeBase64ToBytes(body.file_base64);
    console.log(`[kb-ingest] parsing PDF (${bytes.byteLength} bytes)`);
    const pages = await extractPdfPages(bytes);
    const chunks = chunkPages(pages);
    console.log(`[kb-ingest] ${pages.length} pages -> ${chunks.length} chunks`);

    if (!chunks.length) {
      return new Response(
        JSON.stringify({ error: "no_extractable_text", pages: pages.length }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Upload PDF to storage
    const storagePath = `${userId}/${crypto.randomUUID()}-${(body.filename || "guide.pdf").replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: upErr } = await admin.storage
      .from("kb-sources")
      .upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
    if (upErr) console.warn("[kb-ingest] storage upload warning:", upErr.message);

    // Create document row
    const { data: doc, error: docErr } = await admin
      .from("kb_documents")
      .insert({
        title: body.title,
        source: body.source ?? null,
        crop: body.crop ?? null,
        region: body.region ?? null,
        language: body.language || "en",
        storage_path: upErr ? null : storagePath,
        page_count: pages.length,
        model_version: EMBED_MODEL,
        uploaded_by: userId,
        tags: body.tags ?? [],
        notes: body.notes ?? null,
      })
      .select()
      .single();
    if (docErr || !doc) throw new Error(`document insert failed: ${docErr?.message}`);

    // Embed + insert in batches
    let inserted = 0;
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH);
      const embeddings = await embedBatch(batch.map((c) => c.content));
      const rows = batch.map((c, j) => ({
        document_id: doc.id,
        chunk_index: i + j,
        content: c.content,
        token_count: Math.round(c.content.length / 4),
        embedding: embeddings[j] as unknown as string,
        metadata: { page_number: c.page_number, heading: c.heading ?? null },
        model_version: EMBED_MODEL,
      }));
      const { error: chunkErr } = await admin.from("kb_chunks").insert(rows);
      if (chunkErr) throw new Error(`chunk insert failed: ${chunkErr.message}`);
      inserted += rows.length;
    }

    await admin
      .from("kb_documents")
      .update({ chunk_count: inserted, updated_at: new Date().toISOString() })
      .eq("id", doc.id);

    return new Response(
      JSON.stringify({
        success: true,
        document_id: doc.id,
        pages: pages.length,
        chunks: inserted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[kb-ingest] error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "ingest_failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
