
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
      return new Response(JSON.stringify({ ok: true, fn: 'yield-prediction' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }
  } catch (_) { /* noop */ }


  try {
    const { crop, region, season, farmSize, soilType, previousYield } = await req.json()

    // Call external yield prediction API
    const yieldApiUrl = 'https://yield-prediction-engine.onrender.com/predict'
    
    const response = await fetch(yieldApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        crop,
        region,
        season,
        farm_size: farmSize,
        soil_type: soilType,
        previous_yield: previousYield
      })
    })

    if (!response.ok) {
      // Fallback to mock prediction if external API fails
      const mockPrediction = {
        predicted_yield: (previousYield || 2.5) * (0.8 + Math.random() * 0.4),
        confidence: 0.75 + Math.random() * 0.2,
        factors: [
          { name: "Soil Quality", impact: "positive", value: 0.15 },
          { name: "Rainfall Pattern", impact: "neutral", value: 0.05 },
          { name: "Temperature", impact: "positive", value: 0.10 }
        ],
        recommendations: [
          "Consider nitrogen-rich fertilizer application",
          "Monitor soil moisture levels closely",
          "Plan for pest management in mid-season"
        ]
      }

      return new Response(
        JSON.stringify({ success: true, data: mockPrediction, source: 'mock' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = await response.json()

    return new Response(
      JSON.stringify({ success: true, data, source: 'external_api' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Yield prediction error:', error)
    return new Response(
      JSON.stringify({ error: 'Service temporarily unavailable.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
