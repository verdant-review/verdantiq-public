import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    let token = url.searchParams.get("token");
    if (!token && req.method === "POST") {
      try { token = (await req.json())?.token ?? null; } catch { /* ignore */ }
    }
    if (!token || typeof token !== "string") {
      return new Response(JSON.stringify({ error: "Missing token" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: inv } = await admin
      .from("scheme_invitations")
      .select("id, scheme_id, status, expires_at, farmer_name")
      .eq("token", token)
      .maybeSingle();

    if (!inv) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: scheme } = await admin
      .from("schemes")
      .select("name, description, crop_type, organization_id")
      .eq("id", inv.scheme_id)
      .maybeSingle();

    let org: { name: string; logo_url?: string | null } | null = null;
    if (scheme?.organization_id) {
      const { data: o } = await admin
        .from("organizations")
        .select("name")
        .eq("id", scheme.organization_id)
        .maybeSingle();
      const { data: b } = await admin
        .from("org_branding")
        .select("logo_url")
        .eq("organization_id", scheme.organization_id)
        .maybeSingle();
      if (o) org = { name: o.name, logo_url: b?.logo_url ?? null };
    }

    return new Response(JSON.stringify({ invite: inv, scheme, organization: org }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
