import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { retrieveKbChunks, formatChunksForPrompt } from "../_shared/kb-retrieve.ts"
import { RESPONSIBLE_AI_GUARDRAILS, WHATSAPP_ADVISORY_FOOTER, WEB_ADVISORY_FOOTER } from "../_shared/responsible-ai.ts"



const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders }
)
  }

  // Lightweight health check probe (used by /status page)
  try {
    const u = new URL(req.url);
    if (u.searchParams.get('healthcheck') === '1') {
      return new Response(JSON.stringify({ ok: true, fn: 'ai-agronomist' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }
  } catch (_) { /* noop */ }


  try {
    const { message, context, image, channel } = await req.json()
    const isWhatsApp = channel === 'whatsapp'
    
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')
    
    if (!lovableApiKey) {
      console.log('Lovable AI API key not found')
      return new Response(
        JSON.stringify({ 
          error: 'AI service not configured',
          message: "I'm your AI Agronomist. Unfortunately, I'm currently offline as my AI services need to be configured."
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const isImageAnalysis = !!image

    const farmingType = context?.farming_type || context?.farm?.farming_type || 'crop'

    const systemPrompt = `${RESPONSIBLE_AI_GUARDRAILS}

You are Mudhumeni Hungwe (Powered by Zyterra), an AI agricultural advisor specializing in Zimbabwean and African farming practices. You provide practical, data-driven decision-support guidance for smallholder and commercial farmers.

FARMING TYPE: ${String(farmingType).toUpperCase()}
${farmingType === 'livestock' ? '- LIVESTOCK ONLY: Focus on animal husbandry — vaccination schedules, feed rations, housing, breeding, diseases (FMD, Newcastle, ECF, tick-borne), pasture management. Do NOT push crop advice unless asked.' : ''}
${farmingType === 'mixed' ? '- MIXED FARM (crops + livestock): Consider integration — crop residues as feed, manure as fertilizer, rotational grazing on fallow land. Address whichever the farmer asks about.' : ''}
${farmingType === 'crop' ? '- CROPS: Standard agronomy advice applies.' : ''}

When livestock topics arise, cover: vaccination calendar (Anthrax/Blackleg annually, Newcastle quarterly for poultry, FMD biannually for cattle), feed/forage (silage, hay, supplements, mineral licks), housing/biosecurity, common Zimbabwean diseases (East Coast Fever, FMD, Newcastle, Coccidiosis, mastitis), breeding cycles, and dipping schedules.

${isImageAnalysis ? `IMAGE ANALYSIS MODE:
You are analyzing a crop/plant image uploaded by a farmer. Provide:
## Disease/Pest Identification
[Identify any visible diseases, pests, nutrient deficiencies, or issues]

## Severity Assessment
[Rate severity: Mild / Moderate / Severe / Critical]

## Treatment Recommendations
1. [Immediate action]
2. [Follow-up treatment]
3. [Prevention measures]

## Product Recommendations
- [Specific fungicides/pesticides/fertilizers available in Zimbabwe]
- [Estimated cost in USD/ZWL]

## Monitoring Plan
[What to watch for in coming days/weeks]

If the image is unclear or not a crop/plant, say so honestly.
` : ''}${isWhatsApp ? `WHATSAPP FORMAT (MANDATORY):
You are responding via WhatsApp. Use WhatsApp bold (*text*) not markdown ## headings.
Provide DETAILED, THOROUGH advice — farmers depend on this for their livelihoods.
Give the full response — do NOT self-truncate. Long replies will be auto-chunked across multiple WhatsApp messages. Structure like this:

*Problem/Topic:* [Clear explanation, 2-3 sentences]

*Recommended Action:*
1. [Detailed step 1 with specifics]
2. [Detailed step 2 with quantities/timing]
3. [Step 3 if needed]
4. [Step 4 if needed]

*Products & Costs:*
• [Specific product name] – [dosage/application] – ~$[cost] USD
• [Alternative product if relevant]

*Timing:* [When to apply/do this and follow-up schedule]

*Watch for:* [What to monitor, warning signs, when to escalate]

Be specific about Zimbabwe/African context. Include dosages, application rates, and local product names where possible.
Do NOT be vague or overly brief — give practical, actionable detail.
` : `RESPONSE STRUCTURE (MANDATORY):
You MUST structure every response using this exact format with markdown:

## Main Answer
[Direct, clear response to the question]

## Practical Steps
1. [First action step]
2. [Second action step]
3. [Continue as needed]

## Key Considerations
- [Important factor 1]
- [Important factor 2]

## Cost Estimates
[When relevant, provide estimates in USD and ZWL]

## Timing
[Best timing for implementation]

## Next Steps
[What to monitor or do next]

IMPORTANT GUIDELINES:
- Use clear headings (##) for each section
- Use numbered lists for sequential steps
- Use bullet points for considerations
- Keep paragraphs short (2-3 sentences max)
- Be specific about Zimbabwe/African context
- Provide practical, actionable advice
`}
Context: ${JSON.stringify(context) || 'General agricultural consultation'}`

    // Build messages array
    const userContent: any[] = []
    
    if (image) {
      // Ensure the image has a proper data URI prefix for the vision API
      let imageUrl = image
      if (!imageUrl.startsWith('data:')) {
        imageUrl = `data:image/jpeg;base64,${imageUrl}`
      }
      
      console.log('Image data received, length:', image.length, 'starts with data:', image.startsWith('data:'))
      
      userContent.push({
        type: "image_url",
        image_url: { url: imageUrl }
      })
      userContent.push({
        type: "text",
        text: message || "Please analyze this crop/plant image. Identify any diseases, pests, or issues and provide treatment recommendations."
      })
    } else {
      userContent.push({
        type: "text",
        text: message
      })
    }

    // RAG: retrieve relevant excerpts from the local knowledge base
    let kbBlock = ""
    try {
      if (message) {
        const cropFilter = context?.crop || context?.farm?.primary_crop || null
        const regionFilter = context?.region || context?.farm?.region || null
        const languageFilter = context?.language || null
        const chunks = await retrieveKbChunks({
          query: String(message).slice(0, 2000),
          matchCount: 5,
          minSimilarity: 0.55,
          filterCrop: cropFilter,
          filterRegion: regionFilter,
          filterLanguage: languageFilter,
          surface: isWhatsApp ? "whatsapp" : (isImageAnalysis ? "vision" : "web"),
          userId: context?.user_id ?? null,
        })
        kbBlock = formatChunksForPrompt(chunks)
        if (chunks.length) {
          console.log(`[ai-agronomist] injected ${chunks.length} KB chunks (top sim ${chunks[0].similarity.toFixed(2)})`)
        }
      }
    } catch (err) {
      console.warn("[ai-agronomist] KB retrieval failed, continuing without:", err)
    }

    // Use a vision-capable model when image is present
    const model = 'google/gemini-2.5-flash'

    const finalSystemPrompt = systemPrompt + kbBlock

    console.log(`Making request to Lovable AI Gateway${isImageAnalysis ? ' (Vision mode)' : ''}...`)


    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: finalSystemPrompt },
          { role: 'user', content: isImageAnalysis ? userContent : message }
        ],
        // Response length cap intentionally removed — allow full responses.
        // WhatsApp long messages are auto-chunked by the webhook.
        temperature: 0.7,
      })
    })

    console.log('Lovable AI Gateway response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Lovable AI Gateway error:', response.status, errorText)
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded', message: "I'm receiving too many requests right now. Please wait a moment and try again." }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
        )
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required', message: "AI credits have been exhausted. Please contact the administrator." }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 402 }
        )
      }
      
      throw new Error(`AI Gateway error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Invalid response structure from AI Gateway:', data)
      throw new Error('Invalid response structure from AI Gateway')
    }

    const rawResponse = data.choices[0].message.content
    const advisoryFooter = isWhatsApp ? WHATSAPP_ADVISORY_FOOTER : WEB_ADVISORY_FOOTER
    const aiResponse = rawResponse.includes("verify") && rawResponse.includes("extension officer")
      ? rawResponse
      : rawResponse + advisoryFooter

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: aiResponse,
        agronomist: 'Mudhumeni Hungwe',
        analysis_type: isImageAnalysis ? 'vision' : 'text'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Service temporarily unavailable.',
        message: "I'm experiencing technical difficulties right now. Please try again later."
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
