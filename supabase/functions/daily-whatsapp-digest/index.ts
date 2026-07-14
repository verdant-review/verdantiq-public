import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
  if (!TWILIO_API_KEY) throw new Error("TWILIO_API_KEY is not configured");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Get all completed WhatsApp sessions
    const { data: sessions, error: sessErr } = await supabase
      .from("whatsapp_sessions")
      .select("*")
      .eq("onboarding_step", "complete");

    if (sessErr) throw sessErr;
    if (!sessions || sessions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No registered users to notify", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[DailyDigest] Processing ${sessions.length} users`);

    // Fetch market prices (shared across all users)
    const { data: prices } = await supabase
      .from("market_prices")
      .select("crop, price, currency, unit")
      .order("last_updated", { ascending: false })
      .limit(10);

    const { data: mbarePrices } = await supabase
      .from("mbare_market_prices")
      .select("item, usd_price, zig_price, quantity")
      .order("captured_at", { ascending: false })
      .limit(8);

    let sentCount = 0;
    let errorCount = 0;

    for (const session of sessions) {
      try {
        const lang = session.language || "en";
        const ctx = (session.last_message_context as any) || {};
        const userId = session.user_id;
        const phoneNumber = session.phone_number;

        // --- Farm summary ---
        let farmSummary = "";
        let farmLocation = ctx.location || "Zimbabwe";
        let farmLat: number | null = null;
        let farmLng: number | null = null;

        if (userId) {
          const { data: farms } = await supabase
            .from("farms")
            .select("name, location, size_hectares, latitude, longitude")
            .eq("user_id", userId)
            .limit(1);

          if (farms?.[0]) {
            const f = farms[0];
            farmLocation = f.location || farmLocation;
            farmLat = f.latitude;
            farmLng = f.longitude;
            farmSummary = `🏡 *${f.name || "Your Farm"}*\n📍 ${f.location || "Zimbabwe"}`;
            if (f.size_hectares) farmSummary += ` | ${f.size_hectares}ha`;
          }

          // Active crop cycles
          const { data: farmIds } = await supabase
            .from("farms")
            .select("id")
            .eq("user_id", userId);

          if (farmIds && farmIds.length > 0) {
            const { data: cycles } = await supabase
              .from("crop_cycles")
              .select("crop_type, status, area_hectares, estimated_harvest_date")
              .in("farm_id", farmIds.map((f: any) => f.id))
              .in("status", ["Planning", "Planted", "Growing"])
              .limit(3);

            if (cycles && cycles.length > 0) {
              farmSummary += "\n🌾 *Active Crops:*";
              for (const c of cycles) {
                const harvest = c.estimated_harvest_date
                  ? new Date(c.estimated_harvest_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                  : "TBD";
                farmSummary += `\n• ${c.crop_type} (${c.area_hectares}ha) – ${c.status}, harvest: ${harvest}`;
              }
            }

            // Pending tasks count
            const { data: cycleIds } = await supabase
              .from("crop_cycles")
              .select("id")
              .in("farm_id", farmIds.map((f: any) => f.id));

            if (cycleIds && cycleIds.length > 0) {
              const { count } = await supabase
                .from("cycle_tasks")
                .select("id", { count: "exact", head: true })
                .in("crop_cycle_id", cycleIds.map((c: any) => c.id))
                .eq("is_completed", false);

              if (count && count > 0) {
                farmSummary += `\n📋 ${count} pending task${count > 1 ? "s" : ""}`;
              }
            }
          }
        }

        // --- Weather outlook ---
        let weatherSection = "";
        try {
          const weatherBody: any = { region: farmLocation };
          if (farmLat && farmLng) {
            weatherBody.latitude = farmLat;
            weatherBody.longitude = farmLng;
          }

          const weatherResponse = await fetch(
            `${supabaseUrl}/functions/v1/weather-data`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify(weatherBody),
            }
          );

          if (weatherResponse.ok) {
            const weatherResult = await weatherResponse.json();
            const w = weatherResult?.data?.[0];
            if (w) {
              weatherSection = `\n\n🌤️ *Weather – ${farmLocation}:*\n🌡️ ${w.temperature}°C | 💧 ${w.humidity}% | 🌧️ ${w.rainfall}mm | 💨 ${w.wind_speed}km/h\n☁️ ${w.condition}`;
              if (w.soil_temperature_0cm) {
                weatherSection += `\n🌱 Soil: ${w.soil_temperature_0cm}°C`;
              }
              if (w.soil_moisture_0_1cm) {
                weatherSection += ` | 💧 ${w.soil_moisture_0_1cm}%`;
              }
            }
          }
        } catch (err) {
          console.error(`[DailyDigest] Weather error for ${phoneNumber}:`, err);
        }

        // --- Market prices ---
        let priceSection = "";
        if (prices && prices.length > 0) {
          priceSection = "\n\n📊 *Market Prices:*";
          for (const p of prices) {
            priceSection += `\n• ${p.crop}: ${p.currency} ${p.price}/${p.unit}`;
          }
        }

        if (mbarePrices && mbarePrices.length > 0) {
          priceSection += "\n\n🏪 *Mbare Musika:*";
          for (const p of mbarePrices) {
            priceSection += `\n• ${p.item} (${p.quantity}): $${p.usd_price} / ZiG ${p.zig_price}`;
          }
        }

        // --- Compose message ---
        const greeting = lang === "sn"
          ? `☀️ *Mangwanani ${ctx.name || "Murimi"}!*\nHere's your daily farm digest:`
          : lang === "nd"
          ? `☀️ *Livuke njani ${ctx.name || "Umlimi"}!*\nNansi i-digest yakho yalamuhla:`
          : `☀️ *Good morning ${ctx.name || "Farmer"}!*\nHere's your daily farm digest:`;

        let message = greeting;
        if (farmSummary) message += `\n\n${farmSummary}`;
        message += weatherSection;
        message += priceSection;

        // Truncate if needed (Twilio 1600 char limit)
        if (message.length > 1580) {
          message = message.substring(0, 1575) + "…";
        }

        // Send
        await sendWhatsAppMessage(phoneNumber, message, LOVABLE_API_KEY, TWILIO_API_KEY);
        sentCount++;

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (userErr) {
        console.error(`[DailyDigest] Error for ${session.phone_number}:`, userErr);
        errorCount++;
      }
    }

    console.log(`[DailyDigest] Complete: ${sentCount} sent, ${errorCount} errors`);

    return new Response(
      JSON.stringify({ success: true, sent: sentCount, errors: errorCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[DailyDigest] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: 'Service temporarily unavailable.' }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

async function sendWhatsAppMessage(
  to: string,
  body: string,
  lovableApiKey: string,
  twilioApiKey: string
): Promise<void> {
  const twilioFrom = Deno.env.get("TWILIO_PHONE_NUMBER") || "+15017122661";

  const response = await fetch(`${GATEWAY_URL}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "X-Connection-Api-Key": twilioApiKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
      From: twilioFrom.startsWith("whatsapp:") ? twilioFrom : `whatsapp:${twilioFrom}`,
      Body: body,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`[DailyDigest] Twilio send error [${response.status}]:`, err);
  }
}
