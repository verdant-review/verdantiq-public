import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { RESPONSIBLE_AI_GUARDRAILS } from "../_shared/responsible-ai.ts"


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PlantingInsightRequest {
  cropType: string;
  status: string;
  plantingDate?: string;
  harvestDate?: string;
  areaHectares?: number;
  weather?: {
    temperature?: number;
    humidity?: number;
    rainfall?: number;
    condition?: string;
    soil_temperature?: number;
    soil_moisture?: number;
  };
  region?: string;
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
      return new Response(JSON.stringify({ ok: true, fn: 'planting-insights' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }
  } catch (_) { /* noop */ }


  try {
    const { 
      cropType, 
      status, 
      plantingDate, 
      harvestDate, 
      areaHectares,
      weather,
      region 
    }: PlantingInsightRequest = await req.json()
    
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')
    
    if (!lovableApiKey) {
      console.log('Lovable AI API key not found')
      return new Response(
        JSON.stringify({ 
          error: 'AI service not configured',
          insights: getDefaultInsights(cropType, status)
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const currentDate = new Date().toISOString().split('T')[0]
    const currentMonth = new Date().toLocaleDateString('en-ZW', { month: 'long' })
    
    // Build context for the AI
    let weatherContext = ''
    if (weather) {
      weatherContext = `
Current Weather Conditions:
- Temperature: ${weather.temperature ?? 'Unknown'}°C
- Humidity: ${weather.humidity ?? 'Unknown'}%
- Rainfall: ${weather.rainfall ?? 0}mm
- Condition: ${weather.condition ?? 'Unknown'}
- Soil Temperature: ${weather.soil_temperature ?? 'Unknown'}°C
- Soil Moisture: ${weather.soil_moisture ?? 'Unknown'}%`
    }

    const systemPrompt = `${RESPONSIBLE_AI_GUARDRAILS}

You are Mudhumeni Hungwe (Powered by Zyterra), an expert agronomist providing actionable decision-support insights for Zimbabwean farmers. Today is ${currentDate} (${currentMonth}).

Given the following crop information, provide stage-specific insights and recommendations:

Crop: ${cropType}
Current Stage: ${status}
Region: ${region || 'Zimbabwe'}
Area: ${areaHectares || 'Unknown'} hectares
Planting Date: ${plantingDate || 'Not set'}
Expected Harvest Date: ${harvestDate || 'Not set'}
${weatherContext}

Based on the CURRENT STAGE (${status}), provide insights in this EXACT JSON format:

{
  "stage_summary": "Brief 1-2 sentence summary of what to focus on at this stage",
  "weather_impact": "How current weather affects the crop at this stage",
  "immediate_actions": ["Action 1", "Action 2", "Action 3"],
  "warnings": ["Any warnings based on conditions"],
  "optimal_conditions": {
    "temperature_range": "X-Y°C",
    "soil_moisture": "X-Y%",
    "soil_temperature": "X-Y°C"
  },
  "next_milestone": "What to expect next and when",
  "tips": ["Practical tip 1", "Practical tip 2"]
}

IMPORTANT STAGE-SPECIFIC GUIDANCE:
- **Planning**: Focus on optimal planting windows, seed selection, soil preparation, field layout
- **Growing**: Focus on irrigation schedules, fertilizer timing, pest/disease monitoring, weeding
- **Harvesting**: Focus on harvest timing indicators, equipment readiness, storage preparation, quality checks
- **Completed**: Focus on post-harvest handling, soil restoration, record keeping, planning next cycle

Consider Zimbabwe's agricultural calendar and local conditions. Be specific and actionable.`

    console.log('Requesting planting insights from AI...')

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
          { role: 'user', content: `Provide insights for this ${cropType} crop in the ${status} stage.` }
        ],
        // Response length cap intentionally removed — allow full responses.
        temperature: 0.7,
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('AI Gateway error:', response.status, errorText)
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ 
            error: 'Rate limit exceeded',
            insights: getDefaultInsights(cropType, status)
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }
      
      throw new Error(`AI Gateway error: ${response.status}`)
    }

    const data = await response.json()
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response structure from AI Gateway')
    }

    let aiContent = data.choices[0].message.content.trim()
    
    // Try to extract JSON from the response
    let insights
    try {
      // Remove markdown code blocks if present
      aiContent = aiContent.replace(/```json\n?/g, '').replace(/```\n?/g, '')
      insights = JSON.parse(aiContent)
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError)
      // Fallback to default insights
      insights = getDefaultInsights(cropType, status)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        insights,
        cropType,
        status,
        generatedAt: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Planting insights error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Service temporarily unavailable.',
        insights: getDefaultInsights('crop', 'Planning')
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})

function getDefaultInsights(cropType: string, status: string) {
  const defaults: Record<string, any> = {
    'Planning': {
      stage_summary: `Prepare your fields for ${cropType} planting. Focus on soil testing and seed selection.`,
      weather_impact: 'Check weather forecasts for optimal planting windows.',
      immediate_actions: [
        'Test soil pH and nutrient levels',
        'Source certified seeds',
        'Prepare planting equipment'
      ],
      warnings: ['Ensure adequate soil moisture before planting'],
      optimal_conditions: {
        temperature_range: '20-30°C',
        soil_moisture: '50-70%',
        soil_temperature: '18-25°C'
      },
      next_milestone: 'Begin planting when soil conditions are optimal',
      tips: [
        'Apply basal fertilizer before planting',
        'Consider crop rotation benefits'
      ]
    },
    'Growing': {
      stage_summary: `Monitor your ${cropType} growth and maintain optimal conditions.`,
      weather_impact: 'Current conditions affect water and nutrient uptake.',
      immediate_actions: [
        'Monitor for pests and diseases',
        'Apply top-dressing fertilizer if needed',
        'Maintain irrigation schedule'
      ],
      warnings: ['Watch for signs of nutrient deficiency'],
      optimal_conditions: {
        temperature_range: '22-32°C',
        soil_moisture: '60-80%',
        soil_temperature: '20-28°C'
      },
      next_milestone: 'Continue monitoring until harvest indicators appear',
      tips: [
        'Scout fields weekly for pests',
        'Keep records of all activities'
      ]
    },
    'Harvesting': {
      stage_summary: `Your ${cropType} is ready for harvest. Focus on timing and quality.`,
      weather_impact: 'Dry conditions are optimal for harvest operations.',
      immediate_actions: [
        'Check crop maturity indicators',
        'Prepare harvesting equipment',
        'Arrange storage facilities'
      ],
      warnings: ['Avoid harvesting when moisture is too high'],
      optimal_conditions: {
        temperature_range: '20-35°C',
        soil_moisture: '30-50%',
        soil_temperature: '15-30°C'
      },
      next_milestone: 'Complete harvest and begin post-harvest processing',
      tips: [
        'Harvest during dry weather',
        'Grade produce for quality'
      ]
    },
    'Completed': {
      stage_summary: `${cropType} cycle completed. Plan for the next season.`,
      weather_impact: 'Current conditions affect soil restoration.',
      immediate_actions: [
        'Analyze yield data',
        'Plan crop rotation',
        'Restore soil nutrients'
      ],
      warnings: ['Document lessons learned for future cycles'],
      optimal_conditions: {
        temperature_range: 'N/A',
        soil_moisture: 'N/A',
        soil_temperature: 'N/A'
      },
      next_milestone: 'Begin planning for next planting season',
      tips: [
        'Consider cover crops',
        'Review input costs vs yields'
      ]
    }
  }
  
  return defaults[status] || defaults['Planning']
}
