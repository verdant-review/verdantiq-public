// Detects NDVI anomalies for a farm and triggers Mudhumeni Hungwe diagnosis.
// Called by satellite-ndvi after each fresh reading is persisted.
//
// Detection rules:
//   - week-over-week NDVI drop >= 15%
//   - OR absolute NDVI < 0.30 with a previous reading >= 0.40 (sudden collapse)
//   - SKIPPED when current reading is weather-derived (avoids false positives on cloudy weeks)
//
// Cooldown: 7 days per farm (enforced via recent_ndvi_anomaly_exists RPC).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { RESPONSIBLE_AI_GUARDRAILS } from "../_shared/responsible-ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TWILIO_GATEWAY = "https://connector-gateway.lovable.dev/twilio";

interface InvokeBody {
  farm_id: string;
  ndvi_current: number;
  source: string; // 'sentinel-2' | 'weather_derived_fallback' | ...
  image_captured_at?: string | null;
  weather_snapshot?: Record<string, unknown>;
}

function severityFor(dropPct: number, ndviCurrent: number): "info" | "warning" | "critical" {
  if (ndviCurrent < 0.2 || dropPct >= 30) return "critical";
  if (ndviCurrent < 0.3 || dropPct >= 20) return "warning";
  return "info";
}

async function generateDiagnosis(
  apiKey: string,
  ctx: {
    farmName: string;
    cropType: string;
    growthStage: string;
    ndviCurrent: number;
    ndviPrevious: number | null;
    dropPct: number;
    weather: Record<string, unknown>;
    language: string;
  },
): Promise<{ diagnosis: string; actions: string[] }> {
  const langInstruction = ctx.language === "sn"
    ? "Respond entirely in Shona (chiShona)."
    : ctx.language === "nd"
    ? "Respond entirely in Ndebele (isiNdebele)."
    : "Respond in clear, simple English.";

  const prompt = `${RESPONSIBLE_AI_GUARDRAILS}

You are Mudhumeni Hungwe (Powered by Zyterra), an experienced Zimbabwean agronomist. A satellite has detected a crop health anomaly. Provide decision-support guidance, not definitive instructions.

Farm: ${ctx.farmName}
Crop: ${ctx.cropType || "unknown"}
Growth stage: ${ctx.growthStage || "unknown"}
Current NDVI: ${ctx.ndviCurrent.toFixed(2)}
Previous NDVI: ${ctx.ndviPrevious?.toFixed(2) ?? "n/a"}
Week-over-week drop: ${ctx.dropPct.toFixed(0)}%
Recent weather context: ${JSON.stringify(ctx.weather)}

${langInstruction}

Return STRICT JSON with this shape:
{
  "diagnosis": "One short paragraph (<= 60 words) explaining the most likely cause: drought stress, pest pressure (e.g. fall armyworm), nutrient deficiency, waterlogging, disease, or end-of-cycle senescence. Be honest about uncertainty.",
  "actions": ["Action 1 (specific, doable today)", "Action 2", "Action 3"]
}

Do not include any text outside the JSON.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error("[anomaly] AI gateway failed:", res.status, txt);
    return {
      diagnosis: "Crop vigor has dropped significantly. Inspect the field promptly to identify the cause.",
      actions: [
        "Walk the field and look for pests, wilting, or yellowing leaves.",
        "Check soil moisture at root depth.",
        "Send a photo via the AI Agronomist for a closer diagnosis.",
      ],
    };
  }

  const json = await res.json();
  try {
    const content = json.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    return {
      diagnosis: String(parsed.diagnosis ?? "").slice(0, 600),
      actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 4).map(String) : [],
    };
  } catch (err) {
    console.error("[anomaly] failed to parse AI response", err);
    return { diagnosis: "Vegetation has dropped sharply. Field inspection recommended.", actions: [] };
  }
}

async function sendWhatsApp(
  to: string,
  body: string,
): Promise<boolean> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const twilioKey = Deno.env.get("TWILIO_API_KEY");
  if (!lovableKey || !twilioKey) {
    console.warn("[anomaly] Twilio env not configured, skipping WhatsApp");
    return false;
  }
  const from = Deno.env.get("TWILIO_PHONE_NUMBER") || "+15017122661";
  const trimmed = body.length > 1400 ? body.slice(0, 1397) + "..." : body;

  const res = await fetch(`${TWILIO_GATEWAY}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": twilioKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
      From: from.startsWith("whatsapp:") ? from : `whatsapp:${from}`,
      Body: trimmed,
    }),
  });
  if (!res.ok) {
    console.error("[anomaly] WhatsApp send failed:", res.status, await res.text());
    return false;
  }
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    if (url.searchParams.get("healthcheck") === "1") {
      return new Response(JSON.stringify({ ok: true, fn: "ndvi-anomaly-check" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (_) { /* noop */ }

  // Internal-only endpoint: require the Supabase service role bearer token.
  // Callers (satellite-ndvi) already pass it; external traffic is rejected.
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const presented = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!serviceRoleKey || presented !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as InvokeBody;
    if (!body?.farm_id || typeof body.ndvi_current !== "number") {
      return new Response(JSON.stringify({ error: "farm_id and ndvi_current required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Don't raise alerts on weather-derived fallback readings — too noisy.
    if (body.source !== "sentinel-2") {
      return new Response(JSON.stringify({ skipped: true, reason: "non_satellite_source" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // 7-day cooldown
    const { data: cooling } = await supabase
      .rpc("recent_ndvi_anomaly_exists", { _farm_id: body.farm_id, _cooldown_days: 7 });
    if (cooling === true) {
      return new Response(JSON.stringify({ skipped: true, reason: "cooldown" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the previous Sentinel-2 reading (excluding the one we just inserted)
    const { data: history } = await supabase
      .from("satellite_imagery")
      .select("ndvi_value, image_captured_at, created_at, source")
      .eq("farm_id", body.farm_id)
      .eq("source", "sentinel-2")
      .order("created_at", { ascending: false })
      .limit(5);

    // Skip the latest entry (the one this call corresponds to) and pick the next
    const previous = (history ?? []).slice(1).find((r: any) => Number.isFinite(Number(r.ndvi_value)));
    const ndviPrevious = previous ? Number(previous.ndvi_value) : null;

    let triggerReason: string | null = null;
    let dropPct = 0;
    if (ndviPrevious != null && ndviPrevious > 0) {
      dropPct = ((ndviPrevious - body.ndvi_current) / ndviPrevious) * 100;
      if (dropPct >= 15) triggerReason = "wow_drop";
      if (body.ndvi_current < 0.30 && ndviPrevious >= 0.40) triggerReason = "low_absolute";
    }

    if (!triggerReason) {
      return new Response(JSON.stringify({ skipped: true, reason: "no_anomaly", drop_pct: dropPct }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gather context: farm + owner + active crop cycle + messaging prefs
    const { data: farm } = await supabase
      .from("farms")
      .select("id, name, user_id, latitude, longitude")
      .eq("id", body.farm_id)
      .single();
    if (!farm) {
      return new Response(JSON.stringify({ error: "farm_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: cycle }, { data: prefs }, { data: profile }] = await Promise.all([
      supabase
        .from("crop_cycles")
        .select("crop_type, planting_date, status")
        .eq("farm_id", body.farm_id)
        .in("status", ["Planting", "Growing", "Active", "Planning"])
        .order("planting_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("messaging_preferences")
        .select("whatsapp_enabled, phone_number, language")
        .eq("user_id", farm.user_id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("preferred_language, full_name")
        .eq("id", farm.user_id)
        .maybeSingle(),
    ]);

    const language = prefs?.language || profile?.preferred_language || "en";
    const cropType = cycle?.crop_type || "unknown";
    const growthStage = cycle?.planting_date
      ? `${Math.floor((Date.now() - new Date(cycle.planting_date).getTime()) / (24 * 3600 * 1000))} days after planting`
      : "unknown";

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    let diagnosis = "Crop vigor has dropped sharply. Inspect the field today.";
    let actions: string[] = [];
    if (lovableKey) {
      const result = await generateDiagnosis(lovableKey, {
        farmName: farm.name,
        cropType,
        growthStage,
        ndviCurrent: body.ndvi_current,
        ndviPrevious,
        dropPct,
        weather: body.weather_snapshot ?? {},
        language,
      });
      diagnosis = result.diagnosis;
      actions = result.actions;
    }

    const severity = severityFor(dropPct, body.ndvi_current);

    // Insert anomaly record
    const { data: anomaly, error: insertErr } = await supabase
      .from("ndvi_anomalies")
      .insert({
        farm_id: body.farm_id,
        ndvi_current: body.ndvi_current,
        ndvi_previous: ndviPrevious,
        drop_pct: parseFloat(dropPct.toFixed(1)),
        severity,
        trigger_reason: triggerReason,
        crop_context: { crop_type: cropType, growth_stage: growthStage, weather: body.weather_snapshot ?? {} },
        diagnosis,
        recommended_actions: actions,
        language,
      })
      .select()
      .single();

    if (insertErr) {
      console.error("[anomaly] insert failed:", insertErr);
      return new Response(JSON.stringify({ error: "db_insert_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Dashboard notification
    const titleByLang: Record<string, string> = {
      en: `Crop stress detected on ${farm.name}`,
      sn: `Dambudziko mumbesa pa${farm.name}`,
      nd: `Inkinga yezilimo e-${farm.name}`,
    };
    const title = titleByLang[language] || titleByLang.en;
    const messageShort = `${diagnosis}${actions.length ? "\n\nActions:\n• " + actions.join("\n• ") : ""}`;

    await supabase.from("notifications").insert({
      recipient_user_id: farm.user_id,
      title,
      message: messageShort.slice(0, 1000),
      type: severity === "critical" ? "alert" : "warning",
      metadata: {
        kind: "ndvi_anomaly",
        farm_id: body.farm_id,
        anomaly_id: anomaly.id,
        ndvi_current: body.ndvi_current,
        ndvi_previous: ndviPrevious,
        drop_pct: dropPct,
      },
    });

    // 2. Weather/alert banner so it shows on Crop Health card
    await supabase.from("weather_alerts").insert({
      farm_id: body.farm_id,
      alert_type: "ndvi_anomaly",
      severity: severity === "critical" ? "danger" : "warning",
      message: `${title}: ${diagnosis.slice(0, 200)}`,
      metadata: { anomaly_id: anomaly.id, drop_pct: dropPct, ndvi_current: body.ndvi_current },
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    });

    await supabase
      .from("ndvi_anomalies")
      .update({ notified_dashboard: true })
      .eq("id", anomaly.id);

    // 3. WhatsApp (opt-in)
    let whatsappSent = false;
    if (prefs?.whatsapp_enabled && prefs.phone_number) {
      const waBody = `*🛰️ ${title}*\n\nNDVI: *${body.ndvi_current.toFixed(2)}* (was ${ndviPrevious?.toFixed(2) ?? "n/a"}, ${dropPct.toFixed(0)}% drop)\n\n${diagnosis}\n\n${actions.length ? "*What to do:*\n" + actions.map((a, i) => `${i + 1}. ${a}`).join("\n") : ""}\n\n_— Mudhumeni Hungwe • Powered by Zyterra_`;
      whatsappSent = await sendWhatsApp(prefs.phone_number, waBody);
      if (whatsappSent) {
        await supabase.from("message_log").insert({
          user_id: farm.user_id,
          channel: "whatsapp",
          direction: "outbound",
          message_content: waBody,
          metadata: { kind: "ndvi_anomaly", anomaly_id: anomaly.id },
        });
        await supabase
          .from("ndvi_anomalies")
          .update({ notified_whatsapp: true })
          .eq("id", anomaly.id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        anomaly_id: anomaly.id,
        severity,
        trigger_reason: triggerReason,
        drop_pct: dropPct,
        whatsapp_sent: whatsappSent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[anomaly] error:", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
