// Accept a scheme invitation. Caller must be authenticated.
// Marks invitation accepted, creates an enrollment linked to a farmer field.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Sign in required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { token, field_id } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ error: "token required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: inv, error: invErr } = await admin
      .from("scheme_invitations")
      .select("id, scheme_id, status, expires_at")
      .eq("token", token)
      .maybeSingle();
    if (invErr || !inv) {
      return new Response(JSON.stringify({ error: "Invitation not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (inv.status !== "pending") {
      return new Response(JSON.stringify({ error: `Invitation already ${inv.status}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (new Date(inv.expires_at) < new Date()) {
      await admin.from("scheme_invitations").update({ status: "expired" }).eq("id", inv.id);
      return new Response(JSON.stringify({ error: "Invitation expired" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Resolve field — use provided, or the user's default field.
    let resolvedFieldId = field_id;
    if (!resolvedFieldId) {
      const { data: farm } = await admin.from("farms").select("id").eq("user_id", user.id).limit(1).maybeSingle();
      if (farm) {
        const { data: f } = await admin.from("fields").select("id").eq("farm_id", farm.id).eq("is_default", true).limit(1).maybeSingle();
        resolvedFieldId = f?.id || null;
      }
    }

    const { data: enrollment, error: enrErr } = await admin
      .from("scheme_enrollments")
      .insert({
        scheme_id: inv.scheme_id,
        farmer_user_id: user.id,
        field_id: resolvedFieldId,
        status: "active",
      })
      .select()
      .maybeSingle();
    if (enrErr) {
      return new Response(JSON.stringify({ error: enrErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await admin
      .from("scheme_invitations")
      .update({ status: "accepted", accepted_at: new Date().toISOString(), accepted_by_user_id: user.id })
      .eq("id", inv.id);

    return new Response(JSON.stringify({ ok: true, enrollment }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
