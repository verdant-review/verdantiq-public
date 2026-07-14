// Bulk-create scheme invitations from a list of recipients.
// Caller must be authenticated and a manager/agronomist/extension of the scheme's org.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Recipient {
  phone_number?: string;
  email?: string;
  farmer_name?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const scheme_id: string = body.scheme_id;
    const recipients: Recipient[] = body.recipients || [];

    if (!scheme_id || !Array.isArray(recipients) || recipients.length === 0) {
      return new Response(JSON.stringify({ error: "scheme_id and recipients[] required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (recipients.length > 1000) {
      return new Response(JSON.stringify({ error: "Max 1000 recipients per call" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: canManage } = await admin.rpc("can_manage_scheme", { _user_id: user.id, _scheme_id: scheme_id });
    if (!canManage) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rows = recipients
      .filter((r) => r.phone_number || r.email)
      .map((r) => ({
        scheme_id,
        phone_number: r.phone_number?.trim() || null,
        email: r.email?.trim().toLowerCase() || null,
        farmer_name: r.farmer_name?.trim() || null,
        invited_by: user.id,
      }));

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "No valid recipients" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: inserted, error: insErr } = await admin
      .from("scheme_invitations")
      .insert(rows)
      .select("id, token, phone_number, email");

    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(
      JSON.stringify({ ok: true, created: inserted?.length || 0, invitations: inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
