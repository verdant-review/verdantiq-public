// Dispatch scheme invitations via WhatsApp (Twilio).
// Body: { invitation_ids: string[], base_url: string }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

async function sendWhatsApp(to: string, body: string, lovableKey: string, twilioKey: string) {
  const from = Deno.env.get("TWILIO_PHONE_NUMBER") || "+15017122661";
  const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": twilioKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
      From: from.startsWith("whatsapp:") ? from : `whatsapp:${from}`,
      Body: body,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Twilio ${res.status}: ${txt}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Missing auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");
    const TWILIO_KEY = Deno.env.get("TWILIO_API_KEY");

    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { invitation_ids, base_url } = await req.json();
    if (!Array.isArray(invitation_ids) || invitation_ids.length === 0 || !base_url) {
      return new Response(JSON.stringify({ error: "invitation_ids[] and base_url required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: invites, error } = await admin
      .from("scheme_invitations")
      .select("id, scheme_id, phone_number, email, farmer_name, token, status, metadata, schemes(name, organization_id, organizations(name))")
      .in("id", invitation_ids);
    if (error) throw error;

    const whatsappConfigured = !!(LOVABLE_KEY && TWILIO_KEY);

    let sent = 0, skipped = 0, failed = 0, notified = 0;
    const errors: string[] = [];

    for (const inv of invites || []) {
      // Permission check
      const { data: ok } = await admin.rpc("can_manage_scheme", { _user_id: user.id, _scheme_id: inv.scheme_id });
      if (!ok) { skipped++; continue; }

      const scheme: any = inv.schemes;
      const orgName = scheme?.organizations?.name || "your programme";
      const schemeName = scheme?.name || "the scheme";
      const link = `${base_url.replace(/\/$/, "")}/invite/${inv.token}`;
      const greet = inv.farmer_name ? `Hello ${inv.farmer_name},` : "Hello,";
      const msg = `${greet}\n\n${orgName} has invited you to join "${schemeName}" on VerdantOS.\n\nTap to accept and register your farm:\n${link}\n\nPowered by Zyterra.`;

      // Try to resolve a matching VerdantOS user by email or phone
      let matchedUserId: string | null = null;
      if (inv.email) {
        const { data: p } = await admin.from("profiles").select("id").ilike("email", inv.email).maybeSingle();
        if (p?.id) matchedUserId = p.id;
      }
      if (!matchedUserId && inv.phone_number) {
        const { data: mp } = await admin.from("messaging_preferences").select("user_id").eq("phone_number", inv.phone_number).maybeSingle();
        if (mp?.user_id) matchedUserId = mp.user_id;
      }

      // Create in-app notification for matched farmer (idempotent: skip if invitation already notified)
      const meta: any = { ...(inv.metadata as any || {}) };
      if (matchedUserId && !meta.notified_at) {
        const { error: notifErr } = await admin.from("notifications").insert({
          recipient_user_id: matchedUserId,
          sender_user_id: user.id,
          type: "info",
          title: `Invitation: ${schemeName}`,
          message: `${orgName} has invited you to join "${schemeName}". Tap the link to accept: ${link}`,
          metadata: { scheme_id: inv.scheme_id, invitation_id: inv.id, token: inv.token, link },
        });
        if (!notifErr) {
          meta.notified_at = new Date().toISOString();
          meta.notified_user_id = matchedUserId;
          notified++;
        }
      }

      // Send WhatsApp if a phone number is available
      let whatsappOk = false;
      if (inv.phone_number && whatsappConfigured) {
        try {
          await sendWhatsApp(inv.phone_number, msg, LOVABLE_KEY, TWILIO_KEY);
          meta.sent_at = new Date().toISOString();
          meta.sent_via = "whatsapp";
          whatsappOk = true;
          sent++;
          await new Promise((r) => setTimeout(r, 300));
        } catch (e) {
          failed++;
          errors.push(`${inv.phone_number}: ${(e as Error).message}`);
        }
      } else if (!matchedUserId) {
        skipped++;
      }

      if (whatsappOk || meta.notified_at) {
        await admin.from("scheme_invitations").update({ metadata: meta }).eq("id", inv.id);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, notified, skipped, failed, errors }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
