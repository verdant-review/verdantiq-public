// Status Check Edge Function
// Probes each registered service component and writes a health snapshot.
// Triggered by pg_cron every 2 minutes, or manually by admins.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

interface Component {
  id: string;
  slug: string;
  name: string;
  check_url: string | null;
  latency_warning_ms: number;
  latency_critical_ms: number;
}

const probeEdgeFunction = async (
  fnName: string,
  warnMs: number,
  critMs: number,
): Promise<{ status: string; latency_ms: number; error: string | null }> => {
  const url = `${SUPABASE_URL}/functions/v1/${fnName}?healthcheck=1`;
  const start = performance.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
        apikey: ANON_KEY,
      },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const latency = Math.round(performance.now() - start);
    if (!res.ok && res.status >= 500) {
      return { status: "down", latency_ms: latency, error: `HTTP ${res.status}` };
    }
    if (latency > critMs) return { status: "down", latency_ms: latency, error: "latency critical" };
    if (latency > warnMs) return { status: "degraded", latency_ms: latency, error: "latency warning" };
    return { status: "up", latency_ms: latency, error: null };
  } catch (e: any) {
    const latency = Math.round(performance.now() - start);
    return { status: "down", latency_ms: latency, error: String(e?.message ?? e).slice(0, 200) };
  }
};

const probeDatabase = async (
  supabase: ReturnType<typeof createClient>,
): Promise<{ status: string; latency_ms: number; error: string | null }> => {
  const start = performance.now();
  try {
    const { error } = await supabase.from("service_components").select("id").limit(1);
    const latency = Math.round(performance.now() - start);
    if (error) return { status: "down", latency_ms: latency, error: error.message };
    if (latency > 1000) return { status: "degraded", latency_ms: latency, error: null };
    return { status: "up", latency_ms: latency, error: null };
  } catch (e: any) {
    return { status: "down", latency_ms: 0, error: String(e?.message ?? e).slice(0, 200) };
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Healthcheck probe (used by status-check itself in component checks)
  try {
    const u = new URL(req.url);
    if (u.searchParams.get("healthcheck") === "1") {
      return new Response(JSON.stringify({ ok: true, fn: "status-check" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (_) { /* noop */ }

  // AuthZ: allow either (a) the service role key (pg_cron / internal callers)
  // or (b) an authenticated admin user.
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const presented = authHeader.replace(/^Bearer\s+/i, "").trim();
  let authorized = false;

  if (presented && presented === SERVICE_ROLE_KEY) {
    authorized = true;
  } else if (presented) {
    try {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${presented}` } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser(presented);
      const userId = userData?.user?.id;
      if (!userErr && userId) {
        const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
        const { data: isAdmin } = await adminClient.rpc("is_admin", { _user_id: userId });
        if (isAdmin === true) authorized = true;
      }
    } catch (e) {
      console.warn("[status-check] auth check failed:", e);
    }
  }

  if (!authorized) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const { data: components, error } = await supabase
      .from("service_components")
      .select("id, slug, name, check_url, latency_warning_ms, latency_critical_ms");

    if (error) throw error;

    const results: any[] = [];
    for (const c of (components as Component[]) || []) {
      let probe;
      if (c.slug === "database") {
        probe = await probeDatabase(supabase);
      } else if (c.slug === "web-app") {
        // Web app is implicitly up if this function is responding
        probe = { status: "up", latency_ms: 0, error: null };
      } else if (c.check_url) {
        probe = await probeEdgeFunction(c.check_url, c.latency_warning_ms, c.latency_critical_ms);
      } else {
        probe = { status: "unknown", latency_ms: 0, error: "no check configured" };
      }

      results.push({
        component_id: c.id,
        status: probe.status,
        latency_ms: probe.latency_ms,
        error_message: probe.error,
      });
    }

    if (results.length > 0) {
      const { error: insErr } = await supabase.from("service_health_checks").insert(results);
      if (insErr) throw insErr;
    }

    return new Response(
      JSON.stringify({ ok: true, checked: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
