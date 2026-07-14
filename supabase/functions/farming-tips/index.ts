import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
      return new Response(JSON.stringify({ ok: true, fn: 'farming-tips' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }
  } catch (_) { /* noop */ }


  try {
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')
    
    if (!lovableApiKey) {
      console.log('Lovable AI API key not found')
      return new Response(
        JSON.stringify({ 
          error: 'AI service not configured',
          tip: "December is optimal for planting summer crops. Ensure soil moisture and temperature conditions are right before sowing."
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const currentDate = new Date().toLocaleDateString('en-ZW', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
    const currentMonth = new Date().toLocaleDateString('en-ZW', { month: 'long' })

    const systemPrompt = `You are an agricultural advisor providing daily farming tips for Zimbabwe. Today is ${currentDate}.

Generate ONE practical, actionable farming tip relevant to this time of year (${currentMonth}) in Zimbabwe. Consider:
- Current season and weather patterns
- Typical farming activities for this month
- Pest and disease management relevant now
- Crop care and maintenance tasks
- Soil management practices
- Market preparation activities

Keep the tip:
- Short (2-3 sentences maximum)
- Practical and immediately actionable
- Relevant to Zimbabwe's agricultural calendar
- Appropriate for smallholder farmers
- Focused on a single specific action or practice

DO NOT include any markdown formatting, headings, or bullet points. Just return plain text.`

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Generate today\'s farming tip.' }
        ],
        max_tokens: 200,
        temperature: 0.8,
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Lovable AI Gateway error:', response.status, errorText)
      throw new Error(`AI Gateway error: ${response.status}`)
    }

    const data = await response.json()
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response structure from AI Gateway')
    }

    const tip = data.choices[0].message.content.trim()

    return new Response(
      JSON.stringify({ 
        success: true, 
        tip: tip,
        date: currentDate
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Edge function error:', error)
    // Return a fallback tip
    return new Response(
      JSON.stringify({ 
        error: 'Service temporarily unavailable.',
        tip: "Regular soil testing helps optimize fertilizer use and improve crop yields. Consider testing your soil before the next planting season."
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})
