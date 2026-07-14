// Generate a season summary / impact / compliance report for a scheme.
// Aggregates enrollments, NDVI anomalies, yield estimates into a JSON content blob.
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
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    const { scheme_id, report_type = "season_summary", period_start, period_end, title } = await req.json();
    if (!scheme_id) {
      return new Response(JSON.stringify({ error: "scheme_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: canManage } = await admin.rpc("can_manage_scheme", { _user_id: user.id, _scheme_id: scheme_id });
    if (!canManage) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: scheme } = await admin
      .from("schemes")
      .select("id, name, season, organization_id, commodity_id, start_date, end_date")
      .eq("id", scheme_id)
      .maybeSingle();
    if (!scheme) {
      return new Response(JSON.stringify({ error: "Scheme not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Aggregate enrollments
    const { data: enrollments } = await admin
      .from("scheme_enrollments")
      .select("id, status, farmer_user_id, field_id")
      .eq("scheme_id", scheme_id);

    const farmerIds = [...new Set((enrollments || []).map((e) => e.farmer_user_id))];
    const fieldIds = (enrollments || []).map((e) => e.field_id).filter(Boolean);

    // Field area & NDVI anomalies
    let totalHectares = 0;
    let farmIds: string[] = [];
    if (fieldIds.length) {
      const { data: fields } = await admin.from("fields").select("id, farm_id, area_hectares").in("id", fieldIds);
      totalHectares = (fields || []).reduce((s, f) => s + Number(f.area_hectares || 0), 0);
      farmIds = [...new Set((fields || []).map((f) => f.farm_id))];
    }

    let anomalyCount = 0;
    if (farmIds.length) {
      const { count } = await admin
        .from("ndvi_anomalies")
        .select("*", { count: "exact", head: true })
        .in("farm_id", farmIds);
      anomalyCount = count || 0;
    }

    const statusCounts = (enrollments || []).reduce<Record<string, number>>((acc, e) => {
      acc[e.status] = (acc[e.status] || 0) + 1;
      return acc;
    }, {});

    const { count: invitedCount } = await admin
      .from("scheme_invitations")
      .select("*", { count: "exact", head: true })
      .eq("scheme_id", scheme_id);

    const content = {
      generated_at: new Date().toISOString(),
      scheme: { id: scheme.id, name: scheme.name, season: scheme.season },
      summary: {
        total_invitations: invitedCount || 0,
        total_enrollments: enrollments?.length || 0,
        unique_farmers: farmerIds.length,
        total_hectares: Number(totalHectares.toFixed(2)),
        enrollment_status: statusCounts,
        ndvi_anomalies_detected: anomalyCount,
      },
      period: { start: period_start || scheme.start_date, end: period_end || scheme.end_date },
    };

    const { data: report, error: repErr } = await admin
      .from("scheme_reports")
      .insert({
        scheme_id,
        report_type,
        title: title || `${scheme.name} — ${report_type.replace("_", " ")}`,
        period_start: period_start || scheme.start_date,
        period_end: period_end || scheme.end_date,
        content,
        generated_by: user.id,
      })
      .select()
      .maybeSingle();

    if (repErr) {
      return new Response(JSON.stringify({ error: repErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, report }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
