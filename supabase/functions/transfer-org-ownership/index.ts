// transfer-org-ownership: moves an organization from Zyterra-owned (prospect/pilot)
// to customer-owned (active). Requires double confirmation, DPA acceptance, and
// either platform-admin or current org_owner privileges.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  org_id: string;
  new_owner_user_id: string;
  confirmation_slug: string;
  grace_period_days?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Caller identity (anon-key client + user JWT)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Invalid token" }, 401);
    }
    const callerId = userData.user.id;

    const body = (await req.json()) as Body;
    if (!body?.org_id || !body?.new_owner_user_id || !body?.confirmation_slug) {
      return json({ error: "org_id, new_owner_user_id, and confirmation_slug are required" }, 400);
    }
    const grace = Number.isFinite(body.grace_period_days) ? Math.max(0, Math.floor(body.grace_period_days!)) : 14;

    // Privileged client for the rest of the work
    const admin = createClient(supabaseUrl, serviceKey);

    // Load org
    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .select("id, slug, name, status")
      .eq("id", body.org_id)
      .maybeSingle();
    if (orgErr || !org) return json({ error: "Organization not found" }, 404);

    if (org.slug !== body.confirmation_slug) {
      return json({ error: "confirmation_slug does not match org slug" }, 400);
    }

    // Authorisation: platform admin OR current org_owner
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", callerId)
      .maybeSingle();
    let allowed = !!callerProfile?.is_admin;
    if (!allowed) {
      const { data: callerRole } = await admin
        .from("org_members")
        .select("role")
        .eq("organization_id", org.id)
        .eq("user_id", callerId)
        .maybeSingle();
      allowed = callerRole?.role === "org_owner";
    }
    if (!allowed) return json({ error: "Forbidden" }, 403);

    // New owner must be an existing member
    const { data: newOwnerMember } = await admin
      .from("org_members")
      .select("id, role")
      .eq("organization_id", org.id)
      .eq("user_id", body.new_owner_user_id)
      .maybeSingle();
    if (!newOwnerMember) {
      return json({ error: "Target user must already be a member of the organization" }, 400);
    }

    // DPA must be on file
    const { count: dpaCount } = await admin
      .from("data_license_acceptance")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id);
    if (!dpaCount || dpaCount === 0) {
      return json({ error: "No data_license_acceptance on file for this organization" }, 412);
    }

    // Perform the transition
    const { error: upRoleErr } = await admin
      .from("org_members")
      .update({ role: "org_owner" })
      .eq("id", newOwnerMember.id);
    if (upRoleErr) return json({ error: upRoleErr.message }, 500);

    // Demote any existing owners (except the new one)
    const { error: demoteErr } = await admin
      .from("org_members")
      .update({ role: grace > 0 ? "org_viewer" : "org_viewer" })
      .eq("organization_id", org.id)
      .eq("role", "org_owner")
      .neq("user_id", body.new_owner_user_id);
    if (demoteErr) return json({ error: demoteErr.message }, 500);

    const { error: statusErr } = await admin
      .from("organizations")
      .update({ status: "active", pilot_expires_at: null })
      .eq("id", org.id);
    if (statusErr) return json({ error: statusErr.message }, 500);

    await admin.from("data_access_log").insert({
      organization_id: org.id,
      actor_user_id: callerId,
      action: "ownership_transferred",
      target_type: "organization",
      target_id: org.id,
      metadata: {
        previous_status: org.status,
        new_owner_user_id: body.new_owner_user_id,
        grace_period_days: grace,
      },
    });

    return json({
      ok: true,
      org_id: org.id,
      new_status: "active",
      new_owner_user_id: body.new_owner_user_id,
      grace_period_days: grace,
    });
  } catch (e) {
    console.error("transfer-org-ownership error", e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
