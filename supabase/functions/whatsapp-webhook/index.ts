import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";
const WHATSAPP_REPLY_SAFE_LIMIT = 1100;

// --- Language Detection ---
// NOTE: WhatsApp bot prompts/menus are English-only for now.
// The AI agronomist (Mudhumeni Hungwe) remains multilingual — we still detect
// language and forward it so AI responses can be in Shona/Ndebele/English.

const SHONA_KEYWORDS = [
  "ndiri", "ndoda", "ndinoda", "zita", "tatenda", "maswera", "sei",
  "kurima", "chibage", "mhunga", "nzungu", "mbambaira", "mamiriro",
  "mutengo", "batsira", "kubatsirwa", "mangwanani", "masikati",
];
const NDEBELE_KEYWORDS = [
  "ngifuna", "ngicel", "ibizo", "siyabonga", "linjani", "ukulima",
  "ummbila", "amanzi", "isimo", "sezulu", "intengo", "nceda",
];

function detectLanguage(text: string): string {
  const lower = text.toLowerCase();
  const shonaCount = SHONA_KEYWORDS.filter((w) => lower.includes(w)).length;
  const ndebeleCount = NDEBELE_KEYWORDS.filter((w) => lower.includes(w)).length;
  if (shonaCount > ndebeleCount && shonaCount > 0) return "sn";
  if (ndebeleCount > shonaCount && ndebeleCount > 0) return "nd";
  return "en";
}

// --- Greeting & Intent Detection ---
// Patterns kept multilingual so we still recognize a Shona/Ndebele greeting
// and route it correctly — only the *replies* are English.

const GREETING_PATTERNS = [
  /^(hi|hello|hey|yo|sup|howdy|hola|good\s*(morning|afternoon|evening|day))$/i,
  /^(mangwanani|masikati|manheru|maswera\s*sei|makadii|mhoro|ndeipi)$/i,
  /^(sawubona|sanibonani|linjani|kunjani|yebo)$/i,
  /^(what'?s?\s*up|how\s*are\s*you|greetings)$/i,
];

const QUESTION_PATTERNS = [
  /^(what|how|who|where|when|why|can|do|is|are|will|should)\b/i,
  /\?$/,
  /^(ndingakubatsira|chii|sei|ndeipi|ndinoda\s*kubvunza)/i,
];

const RESET_KEYWORDS = ["restart", "reset", "start over", "tangatange", "qala kabusha"];
const MORE_KEYWORDS = ["more", "details", "zvakawanda", "okunengi", "continue", "full"];

function isGreeting(text: string): boolean {
  return GREETING_PATTERNS.some((p) => p.test(text.trim()));
}

function isQuestion(text: string): boolean {
  return QUESTION_PATTERNS.some((p) => p.test(text.trim()));
}

function isResetRequest(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return RESET_KEYWORDS.some((k) => lower.includes(k));
}

function looksLikeName(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2 || trimmed.length > 50) return false;
  if (isGreeting(trimmed)) return false;
  if (isQuestion(trimmed)) return false;
  if (/^\d+$/.test(trimmed)) return false;
  if (!/[a-zA-Z\u00C0-\u024F]/.test(trimmed)) return false;
  return true;
}

function looksLikeLocation(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2 || trimmed.length > 100) return false;
  if (isGreeting(trimmed)) return false;
  if (/^\d+$/.test(trimmed) && trimmed.length < 3) return false;
  if (!/[a-zA-Z\u00C0-\u024F]/.test(trimmed)) return false;
  return true;
}

function looksLikeCrops(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  if (isGreeting(trimmed)) return false;
  if (/^\d+$/.test(trimmed)) return false;
  return true;
}

function looksLikeSize(text: string): boolean {
  const num = parseFloat(text.replace(/[^0-9.]/g, ""));
  return !isNaN(num) && num > 0 && num < 100000;
}

function extractSize(text: string): number {
  const num = parseFloat(text.replace(/[^0-9.]/g, ""));
  return isNaN(num) ? 1 : num;
}

// --- Prompts (English-only) ---
// We previously shipped Shona/Ndebele copy here, but the translations were
// inaccurate. To avoid confusing farmers, all bot UX copy is English. The
// AI agronomist (Mudhumeni Hungwe) still answers in the user's language.

const PROMPTS: Record<string, string> = {
  welcome: `🌱 Welcome to VerdantIQ! I'm your AI farming assistant.\n\nTo get started, what is your name?`,
  welcome_existing: `🌱 Welcome to VerdantIQ on WhatsApp, {name}! 🎉\n\nI found your existing account and linked it automatically.\n\n🌽 You can now:\n• "prices" – Market prices\n• "weather" – Weather forecast\n• "tasks" – Your upcoming farm tasks\n• "crops" – Your crop cycles\n• "soil" – Soil test results\n• "ndvi" – Satellite crop health 🛰️\n• 📍 Share location – Update farm GPS\n• Send a 📷 crop photo – Disease detection\n• Ask any farming question – AI agronomist (replies in your language)\n• "help" – Full command list\n\nHow can I help you today?`,
  welcome_back: `🌱 Hi there! Welcome back to VerdantIQ!\n\nWe're still getting to know you. What is your name?`,
  ask_name_again: `😊 Thanks for saying hi! I'd love to help you. First, could you tell me your name?`,
  invalid_name: `Hmm, that doesn't look like a name. Could you please type your first name? (e.g., Tendai, Sipho, John)`,
  ask_location: `Thanks {name}! 📍 Where is your farm? You can type a location (e.g., Chipinge, Mutare) or send a GPS location pin.`,
  invalid_location: `I need the location of your farm. Please type a place name (e.g., Chipinge, Mutare, Masvingo) or send a GPS pin 📍`,
  ask_crops: `🌽 What crops do you grow? (e.g., maize, tobacco, groundnuts)`,
  invalid_crops: `Please tell me what crops you grow. Just type them out, e.g. "maize and groundnuts"`,
  ask_size: `📐 How big is your farm in hectares? (Just type a number, e.g., 5)`,
  invalid_size: `I need the farm size as a number in hectares. Just type a number like "5" or "2.5"`,
  complete: `✅ You're all set, {name}!\n\n🌽 Farm: {size}ha in {location} ({crops})\n\nYou can now:\n• "prices" – Market prices\n• "weather" – Weather forecast\n• "tasks" – Your farm tasks\n• "crops" – Crop cycle info\n• "ndvi" – Satellite crop health 🛰️\n• 📍 Share location – Update farm GPS\n• Send a 📷 crop photo – Disease detection\n• Ask any farming question (I'll reply in your language)\n• "help" – Full command list\n\nHappy farming! 🇿🇼`,
  greeting_complete: `👋 Hey {name}! How can I help you today?\n\nSend "help" to see what I can do.`,
  session_reset: `🔄 No problem! Let's start fresh.\n\nWhat is your name?`,
};

function getPrompt(key: string, _lang: string, vars: Record<string, string> = {}): string {
  let text = PROMPTS[key] || "";
  for (const [k, v] of Object.entries(vars)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, "g"), v);
  }
  return text;
}

// --- Existing User Lookup ---
// Check if this phone number already has a web account via messaging_preferences or profiles
async function findExistingUser(supabase: any, phoneNumber: string): Promise<any | null> {
  // Normalize: strip "whatsapp:" prefix
  const cleanPhone = phoneNumber.replace("whatsapp:", "");
  
  // Check messaging_preferences first (most direct link)
  const { data: prefs } = await supabase
    .from("messaging_preferences")
    .select("user_id, language")
    .eq("phone_number", cleanPhone)
    .limit(1);

  if (prefs && prefs.length > 0) {
    const userId = prefs[0].user_id;
    // Get profile info
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, region, crops_of_interest, value_chain_stage")
      .eq("id", userId)
      .single();

    if (profile) {
      // Get farm info
      const { data: farms } = await supabase
        .from("farms")
        .select("name, location, size_hectares, latitude, longitude")
        .eq("user_id", userId)
        .limit(1);

      return {
        userId,
        profile,
        farm: farms?.[0] || null,
        language: prefs[0].language || "en",
      };
    }
  }

  // Also check auth.users by phone
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  if (authUsers?.users) {
    const matched = authUsers.users.find(
      (u: any) => u.phone === cleanPhone || u.phone === cleanPhone.replace("+", "")
    );
    if (matched) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, region, crops_of_interest, value_chain_stage")
        .eq("id", matched.id)
        .single();
      if (profile) {
        const { data: farms } = await supabase
          .from("farms")
          .select("name, location, size_hectares, latitude, longitude")
          .eq("user_id", matched.id)
          .limit(1);
        return {
          userId: matched.id,
          profile,
          farm: farms?.[0] || null,
          language: "en",
        };
      }
    }
  }

  return null;
}

// --- Main Handler ---

// --- Twilio request signature validation ---
// https://www.twilio.com/docs/usage/security#validating-requests
async function validateTwilioSignature(
  req: Request,
  rawBody: string,
  authToken: string,
): Promise<boolean> {
  const signature = req.headers.get("x-twilio-signature") || req.headers.get("X-Twilio-Signature");
  if (!signature) return false;

  // Twilio computes the signature against the exact public URL it called.
  // Supabase/edge proxies can expose slightly different URL forms to the
  // function, so validate against a small set of safe canonical variants.
  const requestUrl = new URL(req.url);
  const forwardedUrl = new URL(req.url);
  const fwdProto = req.headers.get("x-forwarded-proto");
  const fwdHost = req.headers.get("x-forwarded-host");
  if (fwdProto) forwardedUrl.protocol = fwdProto + ":";
  if (fwdHost) forwardedUrl.host = fwdHost;

  const configuredUrl = Deno.env.get("TWILIO_WEBHOOK_URL") ||
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-webhook`;

  const withoutTrailingSlash = (value: string) => value.endsWith("/") ? value.slice(0, -1) : value;
  const withTrailingSlash = (value: string) => withoutTrailingSlash(value) + "/";
  const candidateUrls = [
    requestUrl.toString(),
    forwardedUrl.toString(),
    configuredUrl,
    withoutTrailingSlash(configuredUrl),
    withTrailingSlash(configuredUrl),
  ].filter((value, index, arr) => value && arr.indexOf(value) === index);

  // For form-encoded posts, append sorted POST params (key+value concatenated, no separator).
  const ct = req.headers.get("content-type") || "";
  const params = ct.includes("application/x-www-form-urlencoded") && rawBody
    ? new URLSearchParams(rawBody)
    : null;
  const sortedKeys = params ? [...new Set([...params.keys()])].sort() : [];

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );

  for (const candidateUrl of candidateUrls) {
    let dataToSign = candidateUrl;
    if (params) {
      for (const k of sortedKeys) {
        // getAll handles repeated keys; Twilio joins them in order
        for (const v of params.getAll(k)) dataToSign += k + v;
      }
    }

    const sigBytes = await crypto.subtle.sign("HMAC", key, enc.encode(dataToSign));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));
    // Constant-time-ish compare
    if (expected.length === signature.length) {
      let diff = 0;
      for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
      if (diff === 0) return true;
    }
  }

  console.warn(`[WhatsApp] Signature mismatch for URL variants: ${candidateUrls.join(", ")}`);
  return false;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function emptyTwimlResponse(): Response {
  return new Response("<Response></Response>", {
    headers: { ...corsHeaders, "Content-Type": "text/xml" },
  });
}

function twimlMessageResponse(message: string): Response {
  return new Response(`<Response><Message>${escapeXml(message)}</Message></Response>`, {
    headers: { ...corsHeaders, "Content-Type": "text/xml" },
  });
}

async function deliverWhatsAppReply(
  to: string,
  body: string,
  lovableApiKey: string,
  twilioApiKey: string,
  isTwilioWebhook: boolean,
): Promise<Response> {
  if (isTwilioWebhook) {
    return twimlMessageResponse(body);
  }

  await sendWhatsAppReply(to, body, lovableApiKey, twilioApiKey);
  return emptyTwimlResponse();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders }
);
  }

  // Lightweight health check probe (used by /status page)
  try {
    const u = new URL(req.url);
    if (u.searchParams.get('healthcheck') === '1') {
      return new Response(JSON.stringify({ ok: true, fn: 'whatsapp-webhook' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }
  } catch (_) { /* noop */ }


  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
  if (!TWILIO_API_KEY) throw new Error("TWILIO_API_KEY is not configured");
  const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const contentType = req.headers.get("content-type") || "";
    let from = "";
    let body = "";
    let latitude: number | null = null;
    let longitude: number | null = null;
    let numMedia = 0;
    let mediaUrl = "";
    let rawBody = "";
    let isTwilioWebhook = false;

    if (contentType.includes("application/x-www-form-urlencoded")) {
      isTwilioWebhook = true;
      rawBody = await req.text();

      // Verify Twilio signature on form-encoded webhook posts
      if (!TWILIO_AUTH_TOKEN) {
        console.error("[WhatsApp] TWILIO_AUTH_TOKEN not configured — rejecting webhook");
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
      }
      const valid = await validateTwilioSignature(req, rawBody, TWILIO_AUTH_TOKEN);
      if (!valid) {
        console.warn("[WhatsApp] Twilio signature validation failed");
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
      }

      const params = new URLSearchParams(rawBody);
      from = params.get("From") || "";
      body = (params.get("Body") || "").trim();
      latitude = params.get("Latitude") ? parseFloat(params.get("Latitude")!) : null;
      longitude = params.get("Longitude") ? parseFloat(params.get("Longitude")!) : null;
      numMedia = parseInt(params.get("NumMedia") || "0", 10);
      if (numMedia > 0) {
        mediaUrl = params.get("MediaUrl0") || "";
      }
    } else {
      // Non-form payloads (JSON) are not from Twilio webhooks. Reject unless
      // the caller presents the service role token (internal use).
      const authHeader = req.headers.get("authorization") || "";
      const presented = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (!presented || presented !== supabaseKey) {
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
      }
      const json = await req.json();
      from = json.From || json.from || "";
      body = (json.Body || json.body || "").trim();
      latitude = json.Latitude ? parseFloat(json.Latitude) : null;
      longitude = json.Longitude ? parseFloat(json.Longitude) : null;
    }

    if (!from) {
      return new Response("<Response><Message>Invalid request</Message></Response>", {
        headers: { ...corsHeaders, "Content-Type": "text/xml" },
      });
    }

    console.log(`[WhatsApp] From: ${from}, Body: "${body}", Step: lookup...`);

    // Check for reset request before anything else
    const wantsReset = isResetRequest(body);

    // Look up or create session
    let { data: session } = await supabase
      .from("whatsapp_sessions")
      .select("*")
      .eq("phone_number", from)
      .single();

    // Handle reset
    if (wantsReset && session) {
      await supabase
        .from("whatsapp_sessions")
        .update({
          onboarding_step: "ask_name",
          last_message_context: {},
          user_id: null,
        })
        .eq("id", session.id);

      const lang = session.language || "en";
      const reply = getPrompt("session_reset", lang);
      return await deliverWhatsAppReply(from, reply, LOVABLE_API_KEY, TWILIO_API_KEY, isTwilioWebhook);
    }

    if (!session) {
      const lang = detectLanguage(body);

      // *** KEY FIX: Check if this phone already has a web account ***
      const existingUser = await findExistingUser(supabase, from);

      if (existingUser) {
        console.log(`[WhatsApp] Found existing user: ${existingUser.profile.full_name} (${existingUser.userId})`);

        // Create session linked to existing user, skip onboarding
        const ctx: any = {
          name: existingUser.profile.full_name || "Farmer",
          location: existingUser.farm?.location || existingUser.profile.region || "",
          crops: Array.isArray(existingUser.profile.crops_of_interest)
            ? existingUser.profile.crops_of_interest.join(", ")
            : existingUser.profile.crops_of_interest || "",
          size: existingUser.farm?.size_hectares || "",
        };

        const { data: newSession } = await supabase
          .from("whatsapp_sessions")
          .insert({
            phone_number: from,
            onboarding_step: "complete",
            language: existingUser.language || lang,
            user_id: existingUser.userId,
            last_message_context: ctx,
          })
          .select()
          .single();
        session = newSession;

        // Update messaging_preferences to enable whatsapp
        await supabase
          .from("messaging_preferences")
          .update({ whatsapp_enabled: true, preferred_channel: "whatsapp" })
          .eq("user_id", existingUser.userId);

        const reply = getPrompt("welcome_existing", existingUser.language || lang, {
          name: ctx.name,
        });
        return await deliverWhatsAppReply(from, reply, LOVABLE_API_KEY, TWILIO_API_KEY, isTwilioWebhook);
      }

      // No existing user — start onboarding
      const { data: newSession } = await supabase
        .from("whatsapp_sessions")
        .insert({
          phone_number: from,
          onboarding_step: "ask_name",
          language: lang,
        })
        .select()
        .single();
      session = newSession;

      const reply = getPrompt("welcome", lang);
      return await deliverWhatsAppReply(from, reply, LOVABLE_API_KEY, TWILIO_API_KEY, isTwilioWebhook);
    }

    // Update language if detected differently
    const detectedLang = detectLanguage(body);
    if (detectedLang !== "en" && detectedLang !== session.language) {
      await supabase
        .from("whatsapp_sessions")
        .update({ language: detectedLang })
        .eq("id", session.id);
      session.language = detectedLang;
    }

    const lang = session.language || "en";
    let reply = "";

    console.log(`[WhatsApp] Session step: ${session.onboarding_step}, Body: "${body}"`);

    // Onboarding state machine with validation
    switch (session.onboarding_step) {
      case "ask_name": {
        if (isGreeting(body)) {
          reply = getPrompt("ask_name_again", lang);
          break;
        }
        if (isQuestion(body)) {
          reply = getPrompt("ask_name_again", lang);
          break;
        }
        if (!looksLikeName(body)) {
          reply = getPrompt("invalid_name", lang);
          break;
        }

        const name = body.trim();
        await supabase
          .from("whatsapp_sessions")
          .update({
            onboarding_step: "ask_location",
            last_message_context: { ...(session.last_message_context as any || {}), name },
          })
          .eq("id", session.id);
        reply = getPrompt("ask_location", lang, { name });
        break;
      }

      case "ask_location": {
        const ctx = (session.last_message_context as any) || {};

        if (isGreeting(body) && !latitude) {
          reply = getPrompt("invalid_location", lang);
          break;
        }

        let location = body;
        let lat = latitude;
        let lng = longitude;

        if (lat && lng) {
          location = `${lat}, ${lng}`;
        } else if (!looksLikeLocation(body)) {
          reply = getPrompt("invalid_location", lang);
          break;
        }

        await supabase
          .from("whatsapp_sessions")
          .update({
            onboarding_step: "ask_crops",
            last_message_context: { ...ctx, location, latitude: lat, longitude: lng },
          })
          .eq("id", session.id);
        reply = getPrompt("ask_crops", lang);
        break;
      }

      case "ask_crops": {
        const ctx = (session.last_message_context as any) || {};

        if (isGreeting(body)) {
          reply = getPrompt("invalid_crops", lang);
          break;
        }
        if (!looksLikeCrops(body)) {
          reply = getPrompt("invalid_crops", lang);
          break;
        }

        await supabase
          .from("whatsapp_sessions")
          .update({
            onboarding_step: "ask_size",
            last_message_context: { ...ctx, crops: body.trim() },
          })
          .eq("id", session.id);
        reply = getPrompt("ask_size", lang);
        break;
      }

      case "ask_size": {
        const ctx = (session.last_message_context as any) || {};

        if (!looksLikeSize(body)) {
          reply = getPrompt("invalid_size", lang);
          break;
        }

        const size = extractSize(body);

        // Create the user account and farm
        const { data: authData } = await supabase.auth.admin.createUser({
          phone: from.replace("whatsapp:", ""),
          phone_confirm: true,
          user_metadata: {
            full_name: ctx.name,
            value_chain_stage: "farmer",
          },
        });

        const userId = authData?.user?.id;
        if (userId) {
          await supabase.from("profiles").upsert({
            id: userId,
            full_name: ctx.name,
            value_chain_stage: "farmer",
            region: ctx.location,
            crops_of_interest: ctx.crops?.split(",").map((c: string) => c.trim()),
          });

          await supabase.from("farms").insert({
            user_id: userId,
            name: `${ctx.name}'s Farm`,
            location: ctx.location,
            size_hectares: size,
            latitude: ctx.latitude || null,
            longitude: ctx.longitude || null,
          });

          await supabase.from("messaging_preferences").insert({
            user_id: userId,
            phone_number: from.replace("whatsapp:", ""),
            whatsapp_enabled: true,
            preferred_channel: "whatsapp",
            language: lang,
          });

          await supabase
            .from("whatsapp_sessions")
            .update({
              user_id: userId,
              onboarding_step: "complete",
              last_message_context: { ...ctx, size },
            })
            .eq("id", session.id);
        }

        reply = getPrompt("complete", lang, {
          name: ctx.name || "Farmer",
          size: String(size),
          location: ctx.location || "Zimbabwe",
          crops: ctx.crops || "crops",
        });
        break;
      }

      case "complete":
      default: {
        // 📍 Location pin from an onboarded farmer → update farm coordinates
        if (latitude && longitude && session.user_id) {
          reply = await handleLocationPin(
            supabase,
            session.user_id,
            latitude,
            longitude,
            lang
          );
          break;
        }

        // If user sends a greeting, respond warmly with their name
        if (isGreeting(body)) {
          const ctx = (session.last_message_context as any) || {};
          let name = ctx.name || "Farmer";
          if (session.user_id) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("id", session.user_id)
              .single();
            if (profile?.full_name) name = profile.full_name;
          }
          reply = getPrompt("greeting_complete", lang, { name });
          break;
        }
        // Route commands for onboarded users
        reply = await handleCommand(body, session, supabase, lang, mediaUrl);
        break;
      }
    }

    // Log message
    if (session.user_id) {
      await supabase.from("message_log").insert({
        user_id: session.user_id,
        message_content: body,
        channel: "whatsapp",
        direction: "inbound",
      });
      await supabase.from("message_log").insert({
        user_id: session.user_id,
        message_content: reply,
        channel: "whatsapp",
        direction: "outbound",
      });
    }

    return await deliverWhatsAppReply(from, reply, LOVABLE_API_KEY, TWILIO_API_KEY, isTwilioWebhook);
  } catch (error) {
    console.error("WhatsApp webhook error:", error);
    return new Response("<Response><Message>Something went wrong. Please try again.</Message></Response>", {
      headers: { ...corsHeaders, "Content-Type": "text/xml" },
    });
  }
});

// --- Expanded Command Handler ---

async function handleCommand(
  body: string,
  session: any,
  supabase: any,
  lang: string,
  mediaUrl: string
): Promise<string> {
  const lower = body.toLowerCase().trim();
  const userId = session.user_id;

  // --- MORE command: retrieve stored full response ---
  if (MORE_KEYWORDS.some((k) => lower === k || lower === `"${k}"`)) {
    const ctx = (session.last_message_context as any) || {};
    const pending = ctx.pending_full_response;
    if (pending) {
      // Clear the pending response
      await supabase
        .from("whatsapp_sessions")
        .update({
          last_message_context: { ...ctx, pending_full_response: null },
        })
        .eq("id", session.id);

      // Send in chunks if needed
      const maxLen = WHATSAPP_REPLY_SAFE_LIMIT;
      if (pending.length <= maxLen) {
        return `📋 *Full Details:*\n\n${pending}`;
      }
      // Return first chunk, store remainder
      const chunk = pending.substring(0, maxLen);
      const remainder = pending.substring(maxLen);
      if (remainder.length > 10) {
        await supabase
          .from("whatsapp_sessions")
          .update({
            last_message_context: { ...ctx, pending_full_response: remainder },
          })
          .eq("id", session.id);
        return `📋 *Details (cont.):*\n\n${chunk}\n\n_Reply "more" for the rest_`;
      }
      return `📋 *Full Details:*\n\n${chunk}`;
    }
    return "No additional details available. Ask me a new question!";
  }

  // --- Image / Disease Detection ---
  if (mediaUrl) {
    if (!userId) return "Please complete onboarding first to use disease detection.";

    try {
      console.log(`[WhatsApp] Image received, fetching from Twilio: ${mediaUrl}`);

      // Fetch the image from Twilio (requires Twilio auth)
      const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
      const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") || "";

      const imgResponse = await fetch(mediaUrl, {
        headers: TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
          ? { Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}` }
          : {},
      });

      if (!imgResponse.ok) {
        console.error(`[WhatsApp] Failed to fetch image: ${imgResponse.status}`);
        return "⚠️ I couldn't download your image. Please try sending it again.";
      }

      const imgBuffer = await imgResponse.arrayBuffer();
      // Chunked base64 encoding — spreading a large Uint8Array into String.fromCharCode
      // overflows the call stack for images >~100KB (most WhatsApp photos).
      const bytes = new Uint8Array(imgBuffer);
      let binary = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
      }
      const base64Image = btoa(binary);
      const contentType = imgResponse.headers.get("content-type") || "image/jpeg";
      const dataUri = `data:${contentType};base64,${base64Image}`;

      console.log(`[WhatsApp] Image fetched, size: ${imgBuffer.byteLength} bytes, sending to AI...`);

      // Get user context
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, region, crops_of_interest")
        .eq("id", userId)
        .single();

      const { data: farms } = await supabase
        .from("farms")
        .select("location, size_hectares")
        .eq("user_id", userId)
        .limit(1);

      const farmContext = {
        name: profile?.full_name || "Farmer",
        region: profile?.region || farms?.[0]?.location || "Zimbabwe",
        crops: profile?.crops_of_interest || [],
        farmSize: farms?.[0]?.size_hectares || null,
      };

      // Call ai-agronomist with image
      const aiUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-agronomist`;
      const aiResponse = await fetch(aiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          message: body || "Please analyze this crop/plant image. Identify any diseases, pests, or issues and provide treatment recommendations.",
          context: farmContext,
          image: dataUri,
          channel: "whatsapp",
        }),
      });

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        const aiReply = aiData.message || aiData.response || aiData.reply;
        if (aiReply) {
          // Store the conversation
          await supabase.from("conversations").insert({
            user_id: userId,
            user_message: body || "[Image sent for analysis]",
            ai_response: aiReply,
            message_type: "whatsapp_image",
            farm_context: farmContext,
          });

          // Fit within Twilio's 1600 char limit; store overflow for MORE
          const prefix = "🌿 *Mudhumeni Hungwe — Crop Analysis:*\n\n";
          const suffix = "\n\n_Reply *more* for full details_";
          const maxLen = WHATSAPP_REPLY_SAFE_LIMIT - prefix.length - suffix.length;
          if (aiReply.length > maxLen) {
            const ctx = (session.last_message_context as any) || {};
            await supabase
              .from("whatsapp_sessions")
              .update({ last_message_context: { ...ctx, pending_full_response: aiReply } })
              .eq("id", session.id);
            return `${prefix}${aiReply.substring(0, maxLen)}${suffix}`;
          }
          return `${prefix}${aiReply}`;
        }
      } else {
        const errText = await aiResponse.text();
        console.error(`[WhatsApp] AI agronomist image error: ${aiResponse.status}`, errText);
      }
    } catch (err) {
      console.error("[WhatsApp] Image analysis error:", err);
    }

    return "⚠️ I couldn't analyze your image right now. Please try again or describe the issue in text.";
  }

  // Detect if the message is a natural-language question rather than a single-word command.
  // If so, skip keyword routing and let the AI agronomist handle it with full context.
  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
  const isQuestion = body.includes("?") || wordCount > 3;

  // Price commands
  if (!isQuestion && ["prices", "mutengo", "intengo", "price", "market", "musika", "imakethe"].some((k) => lower.includes(k))) {
    // Check if user is asking about a specific crop
    const { data: prices } = await supabase
      .from("market_prices")
      .select("crop, price, currency, unit, region, last_updated")
      .order("last_updated", { ascending: false })
      .limit(8);

    // Also get Mbare prices
    const { data: mbarePrices } = await supabase
      .from("mbare_market_prices")
      .select("item, usd_price, zig_price, quantity")
      .order("captured_at", { ascending: false })
      .limit(5);

    let msg = "";
    if (prices && prices.length > 0) {
      msg += "📊 *Latest Market Prices:*\n\n";
      for (const p of prices) {
        msg += `• ${p.crop}: ${p.currency} ${p.price}/${p.unit}\n`;
      }
    }

    if (mbarePrices && mbarePrices.length > 0) {
      msg += "\n🏪 *Mbare Musika Prices:*\n";
      for (const p of mbarePrices) {
        msg += `• ${p.item} (${p.quantity}): $${p.usd_price} / ZiG ${p.zig_price}\n`;
      }
    }

    if (!msg) {
      return "No market prices available right now.";
    }
    return msg;
  }

  // Weather commands
  if (!isQuestion && ["weather", "mamiriro", "isimo", "kunze", "forecast"].some((k) => lower.includes(k))) {
    let region = "Harare";
    let farmLat: number | null = null;
    let farmLng: number | null = null;

    if (userId) {
      const { data: farms } = await supabase
        .from("farms")
        .select("location, latitude, longitude")
        .eq("user_id", userId)
        .limit(1);
      if (farms?.[0]) {
        if (farms[0].location) region = farms[0].location;
        if (farms[0].latitude) farmLat = farms[0].latitude;
        if (farms[0].longitude) farmLng = farms[0].longitude;
      }
    }

    try {
      // Call the weather-data edge function directly for fresh/cached data
      const weatherUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/weather-data`;
      const weatherBody: any = { region };
      if (farmLat && farmLng) {
        weatherBody.latitude = farmLat;
        weatherBody.longitude = farmLng;
      }

      const weatherResponse = await fetch(weatherUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify(weatherBody),
      });

      if (weatherResponse.ok) {
        const weatherResult = await weatherResponse.json();
        const w = weatherResult?.data?.[0];
        if (w) {
          let reply = `🌤️ *Weather for ${region}:*\n🌡️ Temp: ${w.temperature}°C\n💧 Humidity: ${w.humidity}%\n🌧️ Rainfall: ${w.rainfall}mm\n💨 Wind: ${w.wind_speed} km/h\n☁️ ${w.condition}`;

          if (w.soil_temperature_0cm || w.soil_moisture_0_1cm) {
            reply += `\n\n🌱 *Soil Conditions:*`;
            if (w.soil_temperature_0cm) reply += `\n🌡️ Soil temp: ${w.soil_temperature_0cm}°C`;
            if (w.soil_moisture_0_1cm) reply += `\n💧 Soil moisture: ${w.soil_moisture_0_1cm}%`;
          }
          return reply;
        }
      }
    } catch (err) {
      console.error("[WhatsApp] Weather fetch error:", err);
    }

    return "No weather data available right now. Try again later.";
  }

  // Tasks command - show upcoming farm tasks
  if (!isQuestion && ["tasks", "mabasa", "imisebenzi", "task", "todo"].some((k) => lower.includes(k))) {
    if (!userId) return "Please complete onboarding first to see your tasks.";

    const { data: tasks } = await supabase
      .from("cycle_tasks")
      .select("task_name, due_date, is_completed, crop_cycle_id")
      .in("crop_cycle_id", 
        supabase.from("crop_cycles").select("id").in("farm_id",
          supabase.from("farms").select("id").eq("user_id", userId)
        )
      )
      .eq("is_completed", false)
      .order("due_date", { ascending: true })
      .limit(8);

    // Fallback: direct join approach
    const { data: farmIds } = await supabase
      .from("farms")
      .select("id")
      .eq("user_id", userId);

    if (!farmIds || farmIds.length === 0) {
      return "No farm found. Register a farm first.";
    }

    const { data: cycleIds } = await supabase
      .from("crop_cycles")
      .select("id")
      .in("farm_id", farmIds.map((f: any) => f.id));

    if (!cycleIds || cycleIds.length === 0) {
      return "No crop cycles found. Add a crop cycle on the web app.";
    }

    const { data: pendingTasks } = await supabase
      .from("cycle_tasks")
      .select("task_name, due_date, is_completed")
      .in("crop_cycle_id", cycleIds.map((c: any) => c.id))
      .eq("is_completed", false)
      .order("due_date", { ascending: true })
      .limit(8);

    if (pendingTasks && pendingTasks.length > 0) {
      let msg = "📋 *Your Upcoming Tasks:*\n\n";
      for (const t of pendingTasks) {
        const due = new Date(t.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
        msg += `• ${t.task_name} (due ${due})\n`;
      }
      return msg;
    }
    return "✅ No pending tasks! You're all caught up.";
  }

  // Crops / crop cycles command
  if (!isQuestion && ["crops", "zvirimwa", "izilimo", "crop", "cycle", "harvest"].some((k) => lower.includes(k))) {
    if (!userId) return "Please complete onboarding first.";

    const { data: farmIds } = await supabase
      .from("farms")
      .select("id")
      .eq("user_id", userId);

    if (!farmIds || farmIds.length === 0) {
      return "No farm found.";
    }

    const { data: cycles } = await supabase
      .from("crop_cycles")
      .select("crop_type, status, area_hectares, planting_date, estimated_harvest_date, predicted_yield_tonnes")
      .in("farm_id", farmIds.map((f: any) => f.id))
      .order("created_at", { ascending: false })
      .limit(5);

    if (cycles && cycles.length > 0) {
      let msg = "🌾 *Your Crop Cycles:*\n\n";
      for (const c of cycles) {
        const harvest = c.estimated_harvest_date
          ? new Date(c.estimated_harvest_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
          : "TBD";
        msg += `• *${c.crop_type}* (${c.area_hectares}ha) – ${c.status}`;
        if (c.predicted_yield_tonnes) msg += ` | Est. yield: ${c.predicted_yield_tonnes}t`;
        msg += ` | Harvest: ${harvest}\n`;
      }
      return msg;
    }
    return "No crop cycles found. Add one on the web app.";
  }

  // Soil test results
  if (!isQuestion && ["soil", "ivhu", "umhlabathi", "test"].some((k) => lower.includes(k))) {
    if (!userId) return "Please complete onboarding first.";

    const { data: soilTests } = await supabase
      .from("soil_tests")
      .select("field_name, ph_level, nitrogen, phosphorus, potassium, recommendations, test_date")
      .eq("user_id", userId)
      .order("test_date", { ascending: false })
      .limit(3);

    if (soilTests && soilTests.length > 0) {
      let msg = "🧪 *Your Soil Test Results:*\n\n";
      for (const s of soilTests) {
        const date = s.test_date ? new Date(s.test_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
        msg += `📍 *${s.field_name || "Field"}* ${date}\n`;
        if (s.ph_level) msg += `  pH: ${s.ph_level}`;
        if (s.nitrogen) msg += ` | N: ${s.nitrogen}`;
        if (s.phosphorus) msg += ` | P: ${s.phosphorus}`;
        if (s.potassium) msg += ` | K: ${s.potassium}`;
        msg += "\n";
        if (s.recommendations) msg += `  💡 ${s.recommendations}\n`;
        msg += "\n";
      }
      return msg;
    }
    return "No soil test results found. Upload your tests on the web app.";
  }

  // Farm info / status
  if (!isQuestion && ["farm", "purimi", "ipulazi", "status", "summary"].some((k) => lower.includes(k))) {
    if (!userId) return "Please complete onboarding first.";

    const { data: farms } = await supabase
      .from("farms")
      .select("name, location, size_hectares")
      .eq("user_id", userId);

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, crops_of_interest, region")
      .eq("id", userId)
      .single();

    let msg = "🏡 *Your Farm Summary:*\n\n";
    if (profile) {
      msg += `👤 ${profile.full_name || "Farmer"}\n`;
      if (profile.crops_of_interest?.length) msg += `🌽 Crops: ${profile.crops_of_interest.join(", ")}\n`;
    }
    if (farms && farms.length > 0) {
      for (const f of farms) {
        msg += `\n🌾 *${f.name}*\n`;
        msg += `  📍 ${f.location || "Unknown"}\n`;
        msg += `  📐 ${f.size_hectares || "?"}ha\n`;
      }
    }
    return msg;
  }

  // Livestock / herd info
  if (!isQuestion && ["herd", "livestock", "boka", "umhlambi", "mombe", "inkomo", "huku"].some((k) => lower.includes(k))) {
    if (!userId) return "Please complete onboarding first.";
    const { data: farms } = await supabase.from("farms").select("id, name").eq("user_id", userId);
    if (!farms?.length) return "No farms found. Register your farm on the web app first.";
    const farmIds = farms.map((f: any) => f.id);
    const { data: herds } = await supabase
      .from("livestock_herds")
      .select("species, breed, herd_size, purpose, status")
      .in("farm_id", farmIds)
      .eq("status", "active");
    if (!herds?.length) return "🐄 No active herds recorded. Add livestock via the web app or reply with: *add herd <species> <count>*";
    let msg = "🐄 *Your Livestock:*\n\n";
    let total = 0;
    for (const h of herds) {
      msg += `• ${h.species}${h.breed ? ` (${h.breed})` : ""}: ${h.herd_size}${h.purpose ? ` – ${h.purpose}` : ""}\n`;
      total += h.herd_size || 0;
    }
    msg += `\n*Total animals:* ${total}`;
    return msg;
  }

  // Vaccination logging
  if (lower.startsWith("vaccinate") || lower.startsWith("vacc ") || lower.includes("vaccination")) {
    if (!userId) return "Please complete onboarding first.";
    const parts = body.trim().split(/\s+/);
    const species = parts[1]?.toLowerCase();
    if (!species) return "Reply with: *vaccinate <species>* (e.g., vaccinate cattle)";
    const { data: farms } = await supabase.from("farms").select("id").eq("user_id", userId);
    const farmIds = (farms || []).map((f: any) => f.id);
    const { data: herd } = await supabase
      .from("livestock_herds")
      .select("id, species, herd_size")
      .in("farm_id", farmIds)
      .ilike("species", `%${species}%`)
      .eq("status", "active")
      .limit(1)
      .single();
    if (!herd) return `🐄 No active *${species}* herd found. Add the herd first via the web app.`;
    await supabase.from("livestock_events").insert({
      herd_id: herd.id,
      event_type: "vaccination",
      quantity: herd.herd_size,
      notes: `Logged via WhatsApp on ${new Date().toISOString().split("T")[0]}`,
    });
    return `✅ Vaccination logged for ${herd.herd_size} ${herd.species}. Next reminder in ~6 months.`;
  }

  // Mechanization / tractor info
  if (!isQuestion && ["tractor", "mechanization", "equipment", "tirakita", "imatshini"].some((k) => lower.includes(k))) {
    if (!userId) return "Please complete onboarding first.";
    const { data: farms } = await supabase.from("farms").select("id, name").eq("user_id", userId);
    if (!farms?.length) return "No farms found.";
    let msg = "🚜 *Mechanization Score:*\n\n";
    for (const f of farms) {
      const { data: scoreData } = await supabase.rpc("get_farm_mechanization_score", { _farm_id: f.id });
      const score = (scoreData as any)?.score ?? 0;
      const band = (scoreData as any)?.band ?? "Mostly manual";
      msg += `🌾 *${f.name}*: ${score}/100 — ${band}\n`;
    }
    msg += `\nAdd equipment on the web app to improve your score.`;
    return msg;
  }

  // 🛰️ NDVI / crop health command
  if (["ndvi", "health", "utano", "impilo", "satellite", "satelite"].some((k) => lower === k || lower.startsWith(`${k} `))) {
    if (!userId) return "Please complete onboarding first.";
    return await handleNdviCommand(supabase, userId, lang);
  }

  // Help command
  if (!isQuestion && ["help", "batsira", "nceda", "menu"].some((k) => lower.includes(k))) {
    return `📋 *VerdantIQ Commands:*\n\n• "prices" – Market prices & Mbare Musika\n• "weather" – Weather + soil conditions\n• "tasks" – Your pending farm tasks\n• "crops" – Crop cycle status\n• "soil" – Soil test results\n• "farm" – Farm summary\n• "herd" – Your livestock\n• "vaccinate <species>" – Log vaccination\n• "tractor" – Mechanization score\n• "ndvi" – Satellite crop health 🛰️\n• 📍 Share location – Update farm GPS\n• Send a 📷 photo – Disease detection\n• Type any question – AI agronomist (replies in your language)\n• "restart" – Reset your profile\n• "help" – Show this menu`;
  }

  // Default: AI agronomist - try to invoke the AI edge function
  if (userId) {
    try {
      // Get user context for better AI responses
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, region, crops_of_interest")
        .eq("id", userId)
        .single();

      const { data: farms } = await supabase
        .from("farms")
        .select("location, size_hectares")
        .eq("user_id", userId)
        .limit(1);

      const farmContext = {
        name: profile?.full_name || "Farmer",
        region: profile?.region || farms?.[0]?.location || "Zimbabwe",
        crops: profile?.crops_of_interest || [],
        farmSize: farms?.[0]?.size_hectares || null,
      };

      // Call the AI agronomist edge function
      const aiUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-agronomist`;
      const aiResponse = await fetch(aiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          message: body,
          context: farmContext,
          language: lang,
          channel: "whatsapp",
        }),
      });

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        const aiReply = aiData.response || aiData.reply || aiData.message;
        if (aiReply) {
          // Store the conversation
          await supabase.from("conversations").insert({
            user_id: userId,
            user_message: body,
            ai_response: aiReply,
            message_type: "whatsapp",
            farm_context: farmContext,
          });
          // Fit within Twilio's 1600 char limit; store overflow for MORE
          const prefix = "🌿 *Mudhumeni Hungwe:*\n\n";
          const suffix = "\n\n_Reply *more* for full details_";
          const maxLen = WHATSAPP_REPLY_SAFE_LIMIT - prefix.length - suffix.length;
          if (aiReply.length > maxLen) {
            const ctx = (session.last_message_context as any) || {};
            await supabase
              .from("whatsapp_sessions")
              .update({ last_message_context: { ...ctx, pending_full_response: aiReply } })
              .eq("id", session.id);
            return `${prefix}${aiReply.substring(0, maxLen)}${suffix}`;
          }
          return `${prefix}${aiReply}`;
        }
      }
    } catch (err) {
      console.error("[WhatsApp] AI agronomist error:", err);
    }
  }

  // Fallback
  return `🌿 I'm not sure how to answer that yet. Try:\n• "prices" for market prices\n• "weather" for forecasts\n• "tasks" for your farm tasks\n• "help" for all commands\n\nOr ask a specific farming question!`;
}

// --- WhatsApp Reply Sender ---

async function sendWhatsAppReply(
  to: string,
  body: string,
  lovableApiKey: string,
  twilioApiKey: string
): Promise<void> {
  const twilioFrom = Deno.env.get("TWILIO_PHONE_NUMBER") || "+263775919996";

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
    console.error(`Twilio send error [${response.status}]:`, err);
  }
}

// --- 📍 Location Pin Handler ---
// Updates farm GPS coordinates and PostGIS centroid when a farmer shares a WhatsApp location.

async function handleLocationPin(
  supabase: any,
  userId: string,
  lat: number,
  lng: number,
  lang: string
): Promise<string> {
  // Get the farmer's primary farm
  const { data: farms } = await supabase
    .from("farms")
    .select("id, name")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (!farms || farms.length === 0) {
    return "📍 Got your location, but no farm is registered yet. Please complete registration on the web app first.";
  }

  const farm = farms[0];

  // Update lat/lng on the farm row
  const { error: updErr } = await supabase
    .from("farms")
    .update({ latitude: lat, longitude: lng })
    .eq("id", farm.id);

  if (updErr) {
    console.error("[WhatsApp] Failed to update farm coords:", updErr);
    return "⚠️ I couldn't save your location right now. Please try again.";
  }

  // Note: PostGIS boundary intentionally not updated here — boundary requires a polygon,
  // not a single point. The lat/lng columns are sufficient for weather + NDVI lookups.

  return `📍 ✅ Location saved for *${farm.name}*!\n\n🌍 ${lat.toFixed(4)}, ${lng.toFixed(4)}\n\nReply *ndvi* to see your latest satellite crop health, or *weather* for the local forecast.`;
}

// --- 🛰️ NDVI Command Handler ---
// Calls the satellite-ndvi edge function with internal-source headers and formats the result.

async function handleNdviCommand(
  supabase: any,
  userId: string,
  lang: string
): Promise<string> {
  const { data: farms } = await supabase
    .from("farms")
    .select("id, name, latitude, longitude")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (!farms || farms.length === 0) {
    return "No farm found. Register a farm on the web app first.";
  }
  const farm = farms[0];

  if (!farm.latitude || !farm.longitude) {
    return `📍 I don't have GPS coordinates for *${farm.name}* yet. Please share your farm's location pin (📎 → Location) and I'll fetch satellite data for you.`;
  }

  try {
    const ndviUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/satellite-ndvi`;
    const res = await fetch(ndviUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "x-internal-source": "whatsapp-webhook",
      },
      body: JSON.stringify({
        farm_id: farm.id,
        latitude: Number(farm.latitude),
        longitude: Number(farm.longitude),
      }),
    });

    if (!res.ok) {
      console.error("[WhatsApp] NDVI fetch failed:", res.status, await res.text());
      return "⚠️ Satellite data is unavailable right now. Please try again in a few minutes.";
    }

    const data = await res.json();
    const ndvi = Number(data.ndvi);
    const status = data.health_status || "Unknown";
    const captured = data.image_captured_at
      ? new Date(data.image_captured_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
      : "recent";
    const cloud = data.cloud_cover_pct != null ? ` (${Number(data.cloud_cover_pct).toFixed(0)}% cloud)` : "";
    const sourceLabel = data.source === "sentinel-2" ? "Sentinel-2 satellite" : "weather-derived estimate";

    // Build a tiny ASCII trend from the timeline (last 7 entries)
    let trend = "";
    if (Array.isArray(data.timeline) && data.timeline.length > 0) {
      const last7 = data.timeline.slice(-7);
      trend = "\n\n📈 *7-day trend:* " + last7
        .map((d: any) => {
          const v = Number(d.ndvi);
          if (v >= 0.6) return "🟢";
          if (v >= 0.4) return "🟡";
          if (v >= 0.25) return "🟠";
          return "🔴";
        })
        .join("");
    }

    return `🛰️ *Crop Health for ${farm.name}*\n\n` +
      `🌿 *NDVI:* ${Number.isFinite(ndvi) ? ndvi.toFixed(2) : "?"}\n` +
      `📊 *Status:* ${status}\n` +
      `📅 *Captured:* ${captured}${cloud}\n` +
      `🛰️ Source: ${sourceLabel}` +
      trend +
      "\n\n_Powered by Zyterra. Reply *more* for full guidance from Mudhumeni Hungwe._";
  } catch (err) {
    console.error("[WhatsApp] NDVI command error:", err);
    return "⚠️ Couldn't reach the satellite service. Please try again.";
  }
}
