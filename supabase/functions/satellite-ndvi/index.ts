import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const AGRO_BASE = 'http://api.agromonitoring.com/agro/1.0'
const FREE_TIER_HA_LIMIT = 950 // leave headroom under 1000 ha free quota
const SATELLITE_CACHE_DAYS = 5 // Sentinel-2 revisit cadence

function classifyNdvi(ndvi: number) {
  if (ndvi >= 0.6) return { health_status: 'Excellent', health_color: 'green' }
  if (ndvi >= 0.4) return { health_status: 'Good', health_color: 'lime' }
  if (ndvi >= 0.25) return { health_status: 'Moderate', health_color: 'yellow' }
  if (ndvi >= 0.1) return { health_status: 'Stressed', health_color: 'orange' }
  return { health_status: 'Critical', health_color: 'red' }
}

// Try to fetch a fresh real Sentinel-2 NDVI for this farm. Returns null if not possible.
async function tryAgroMonitoringNdvi(
  supabase: any,
  farmId: string,
  apiKey: string,
  farmBoundary: any,
  farmAreaHa: number,
  farmName: string,
) {
  try {
    // 1. Look up existing polygon
    const { data: existingPoly } = await supabase
      .from('farm_polygons')
      .select('agromonitoring_polygon_id, area_ha')
      .eq('farm_id', farmId)
      .maybeSingle()

    let polygonId: string | null = existingPoly?.agromonitoring_polygon_id ?? null

    // 2. If no polygon, check quota and create one
    if (!polygonId) {
      if (!farmBoundary) {
        console.warn(`[agromonitoring] no boundary for farm ${farmId}, skipping satellite path`)
        return null
      }

      // Quota guard
      const { data: usage } = await supabase
        .from('farm_polygons')
        .select('area_ha')
      const usedHa = (usage ?? []).reduce((s: number, r: any) => s + Number(r.area_ha || 0), 0)
      if (usedHa + (farmAreaHa || 0) > FREE_TIER_HA_LIMIT) {
        console.warn(`[agromonitoring] quota guard: ${usedHa} + ${farmAreaHa} > ${FREE_TIER_HA_LIMIT}, falling back`)
        return null
      }

      const createRes = await fetch(`${AGRO_BASE}/polygons?appid=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: farmName?.slice(0, 60) || `farm_${farmId.slice(0, 8)}`,
          geo_json: { type: 'Feature', properties: {}, geometry: farmBoundary },
        }),
      })
      if (!createRes.ok) {
        const txt = await createRes.text()
        console.warn(`[agromonitoring] polygon create failed ${createRes.status}: ${txt}`)
        return null
      }
      const polyJson = await createRes.json()
      polygonId = polyJson.id
      const reportedAreaHa = Number(polyJson.area) || farmAreaHa || 0

      await supabase.from('farm_polygons').insert({
        farm_id: farmId,
        agromonitoring_polygon_id: polygonId,
        area_ha: reportedAreaHa,
      })
    }

    // 3. Fetch NDVI history (free-tier endpoint — returns pre-computed stats directly,
    //    no separate /stats fetch needed). Look back 30 days to handle cloudy weeks.
    const end = Math.floor(Date.now() / 1000)
    const start = end - 30 * 24 * 3600
    const histRes = await fetch(
      `${AGRO_BASE}/ndvi/history?start=${start}&end=${end}&polyid=${polygonId}&appid=${apiKey}`,
    )
    if (!histRes.ok) {
      console.warn(`[agromonitoring] ndvi history failed ${histRes.status}`)
      return null
    }
    const history = await histRes.json()
    if (!Array.isArray(history) || history.length === 0) {
      console.log(`[agromonitoring] no ndvi history in last 30 days for polygon ${polygonId}`)
      return null
    }

    // Filter to usable scenes (cloud cover ≤ 60%). cl in /ndvi/history is a fraction 0–1.
    const clear = history.filter((h: any) => {
      const cl = Number(h.cl ?? 1)
      const pct = cl <= 1 ? cl * 100 : cl
      return pct <= 60
    })
    if (clear.length === 0) {
      console.log(`[agromonitoring] no scenes ≤60% cloud in last 30 days for polygon ${polygonId}`)
      return null
    }
    clear.sort((a: any, b: any) => (b.dt || 0) - (a.dt || 0))
    const newest = clear[0]
    const meanNdvi = Number(newest?.data?.mean)
    if (!Number.isFinite(meanNdvi)) {
      console.warn(`[agromonitoring] ndvi history missing mean on newest entry`)
      return null
    }

    // cl is reported as a fraction (0–1) in /ndvi/history; normalise to percent
    const clRaw = Number(newest.cl ?? 0)
    const cloudPct = clRaw <= 1 ? clRaw * 100 : clRaw

    return {
      ndvi: parseFloat(meanNdvi.toFixed(4)),
      image_captured_at: new Date((newest.dt || end) * 1000).toISOString(),
      cloud_cover_pct: parseFloat(cloudPct.toFixed(1)),
      raw_stats: newest.data,
    }
  } catch (err) {
    console.error(`[agromonitoring] error:`, err)
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const u = new URL(req.url)
    if (u.searchParams.get('healthcheck') === '1') {
      return new Response(JSON.stringify({ ok: true, fn: 'satellite-ndvi' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }
  } catch (_) { /* noop */ }

  try {
    const authHeader = req.headers.get('Authorization')
    const internalToken = req.headers.get('x-internal-source')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const isInternal = internalToken === 'whatsapp-webhook' &&
      authHeader === `Bearer ${serviceKey}`

    let userId: string | null = null

    if (!isInternal) {
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const authedClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      )
      const token = authHeader.replace('Bearer ', '')
      const { data: claimsData, error: claimsError } = await authedClient.auth.getClaims(token)
      if (claimsError || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      userId = claimsData.claims.sub as string
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceKey
    )

    const { farm_id, latitude, longitude } = await req.json()
    if (!farm_id || !latitude || !longitude) {
      return new Response(
        JSON.stringify({ error: 'farm_id, latitude, and longitude are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify ownership and get farm details. Internal callers (webhook) skip the user_id filter.
    const farmQuery = supabase
      .from('farms')
      .select('id, name, size_hectares')
      .eq('id', farm_id)
    const { data: ownedFarm, error: ownErr } = isInternal
      ? await farmQuery.maybeSingle()
      : await farmQuery.eq('user_id', userId!).maybeSingle()
    if (ownErr || !ownedFarm) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch boundary as GeoJSON via PostGIS (separate call so we can use ST_AsGeoJSON)
    let farmBoundary: any = null
    try {
      const { data: boundaryRow } = await supabase
        .rpc('get_farm_boundary_geojson' as any, { _farm_id: farm_id })
      if (boundaryRow) {
        farmBoundary = typeof boundaryRow === 'string' ? JSON.parse(boundaryRow) : boundaryRow
      }
    } catch (_) {
      // RPC may not exist yet — fall back to bounding box around the centroid
    }
    if (!farmBoundary) {
      // Build a small square polygon (~500m) around the centroid as a fallback
      const d = 0.0045 // ~500m
      farmBoundary = {
        type: 'Polygon',
        coordinates: [[
          [longitude - d, latitude - d],
          [longitude + d, latitude - d],
          [longitude + d, latitude + d],
          [longitude - d, latitude + d],
          [longitude - d, latitude - d],
        ]],
      }
    }

    // 5-day cache: if we already have a Sentinel-2 reading recently, return it
    const cacheCutoff = new Date(Date.now() - SATELLITE_CACHE_DAYS * 24 * 3600 * 1000).toISOString()
    const { data: cachedSat } = await supabase
      .from('satellite_imagery')
      .select('*')
      .eq('farm_id', farm_id)
      .eq('source', 'sentinel-2')
      .gte('created_at', cacheCutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let satellite: Awaited<ReturnType<typeof tryAgroMonitoringNdvi>> = null

    if (cachedSat) {
      satellite = {
        ndvi: Number(cachedSat.ndvi_value),
        image_captured_at: cachedSat.image_captured_at ?? cachedSat.created_at,
        cloud_cover_pct: Number(cachedSat.cloud_cover_pct ?? 0),
        raw_stats: null,
      }
    } else {
      const apiKey = Deno.env.get('AGROMONITORING_API_KEY')
      if (apiKey) {
        satellite = await tryAgroMonitoringNdvi(
          supabase, farm_id, apiKey, farmBoundary,
          Number(ownedFarm.size_hectares) || 0,
          ownedFarm.name,
        )
      }
    }

    // ---- Always also compute the weather-derived index for the timeline + factors ----
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,et0_fao_evapotranspiration&hourly=soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm,soil_moisture_9_to_27cm,soil_temperature_0cm&past_days=14&forecast_days=0&models=best_match&timezone=Africa/Harare`

    let data: any = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(weatherUrl)
        if (response.ok) { data = await response.json(); break }
        console.warn(`Weather API attempt ${attempt + 1} failed: ${response.status}`)
      } catch (fetchErr) {
        console.warn(`Weather API attempt ${attempt + 1} error:`, (fetchErr as any).message)
      }
      if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
    }

    // Total weather failure path — still return satellite if we have it
    if (!data) {
      if (satellite) {
        const cls = classifyNdvi(satellite.ndvi)
        return new Response(JSON.stringify({
          success: true, ndvi: satellite.ndvi, ...cls,
          timeline: [], factors: {},
          source: 'sentinel-2',
          image_captured_at: satellite.image_captured_at,
          cloud_cover_pct: satellite.cloud_cover_pct,
          note: 'Real Sentinel-2 NDVI. Weather context temporarily unavailable.',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const { data: recentNdvi } = await supabase
        .from('satellite_imagery').select('*').eq('farm_id', farm_id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (recentNdvi) {
        const cls = classifyNdvi(Number(recentNdvi.ndvi_value))
        return new Response(JSON.stringify({
          success: true, ndvi: Number(recentNdvi.ndvi_value), ...cls,
          timeline: [], factors: {},
          source: 'cached_fallback',
          image_captured_at: recentNdvi.image_captured_at ?? recentNdvi.created_at,
          cloud_cover_pct: recentNdvi.cloud_cover_pct,
          note: 'Weather API temporarily unavailable. Showing most recent NDVI reading.'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      return new Response(JSON.stringify({
        success: true, ndvi: 0.45, health_status: 'Good', health_color: 'lime',
        timeline: [], factors: {}, source: 'default_fallback',
        note: 'Weather API temporarily unavailable. Showing estimated default values.'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Compute weather-derived NDVI proxy
    const avgSoilMoisture = data.hourly.soil_moisture_0_to_1cm
      .filter((v: number | null) => v !== null)
      .reduce((s: number, v: number) => s + v, 0) / data.hourly.soil_moisture_0_to_1cm.length
    // True daily mean — prefer Open-Meteo's temperature_2m_mean, fall back to (max+min)/2
    const dailyMeans: number[] = (data.daily.temperature_2m_mean || []).map((m: number | null, i: number) => {
      if (m != null) return m
      const mx = data.daily.temperature_2m_max?.[i]
      const mn = data.daily.temperature_2m_min?.[i]
      return mx != null && mn != null ? (mx + mn) / 2 : null
    }).filter((v: number | null) => v != null) as number[]
    const avgTemp = dailyMeans.length
      ? dailyMeans.reduce((s, v) => s + v, 0) / dailyMeans.length
      : data.daily.temperature_2m_max.reduce((s: number, v: number) => s + v, 0) / data.daily.temperature_2m_max.length
    const totalPrecip = data.daily.precipitation_sum.reduce((s: number, v: number) => s + (v || 0), 0)
    const avgET0 = data.daily.et0_fao_evapotranspiration
      .filter((v: number | null) => v !== null)
      .reduce((s: number, v: number) => s + v, 0) / data.daily.et0_fao_evapotranspiration.length

    const moistureScore = Math.min(avgSoilMoisture * 10, 0.3)
    const tempScore = avgTemp >= 15 && avgTemp <= 35 ? 0.25 * (1 - Math.abs(avgTemp - 25) / 15) : 0.05
    const precipScore = Math.min(totalPrecip / 100, 0.15)
    const etScore = Math.min(avgET0 / 50, 0.1)
    const weatherDerivedNdvi = Math.min(Math.max(moistureScore + tempScore + precipScore + etScore + 0.15, -0.1), 0.95)

    const ndviTimeline = data.daily.temperature_2m_max.map((maxTemp: number, i: number) => {
      const minTemp = data.daily.temperature_2m_min?.[i] ?? maxTemp
      const meanTemp = data.daily.temperature_2m_mean?.[i] ?? (maxTemp + minTemp) / 2
      const dayMoisture = data.hourly.soil_moisture_0_to_1cm[i * 24] || avgSoilMoisture
      const dayPrecip = data.daily.precipitation_sum[i] || 0
      const dayET0 = data.daily.et0_fao_evapotranspiration[i] || avgET0
      const mS = Math.min(dayMoisture * 10, 0.3)
      const tS = meanTemp >= 15 && meanTemp <= 35 ? 0.25 * (1 - Math.abs(meanTemp - 25) / 15) : 0.05
      const pS = Math.min(dayPrecip / 20, 0.15)
      const eS = Math.min(dayET0 / 50, 0.1)
      return {
        date: data.daily.time[i],
        ndvi: Math.min(Math.max(mS + tS + pS + eS + 0.15, -0.1), 0.95),
        soil_moisture: dayMoisture,
        temperature_max: maxTemp,
        temperature_min: minTemp,
        precipitation: dayPrecip,
        et0: dayET0
      }
    })

    // Decide which NDVI to surface
    const finalNdvi = satellite ? satellite.ndvi : weatherDerivedNdvi
    const cls = classifyNdvi(finalNdvi)
    const source = satellite ? 'sentinel-2' : 'weather_derived_fallback'

    // Persist (skip if we returned a cached satellite reading — already in DB)
    if (!cachedSat) {
      await supabase.from('satellite_imagery').insert({
        farm_id,
        ndvi_value: parseFloat(finalNdvi.toFixed(4)),
        source,
        image_url: null,
        image_captured_at: satellite?.image_captured_at ?? null,
        cloud_cover_pct: satellite?.cloud_cover_pct ?? null,
      })

      // Fire-and-forget anomaly check (only for fresh Sentinel-2 readings).
      // We don't await — the satellite call should return promptly to the UI.
      if (satellite) {
        const anomalyUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ndvi-anomaly-check`
        fetch(anomalyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
          },
          body: JSON.stringify({
            farm_id,
            ndvi_current: parseFloat(finalNdvi.toFixed(4)),
            source,
            image_captured_at: satellite.image_captured_at,
            weather_snapshot: {
              avg_soil_moisture: parseFloat(avgSoilMoisture.toFixed(4)),
              avg_temperature: parseFloat(avgTemp.toFixed(1)),
              total_precipitation_14d: parseFloat(totalPrecip.toFixed(1)),
              avg_evapotranspiration: parseFloat(avgET0.toFixed(2)),
            },
          }),
        }).catch((e) => console.warn('[satellite-ndvi] anomaly check dispatch failed:', e))
      }
    }

    return new Response(JSON.stringify({
      success: true,
      ndvi: parseFloat(finalNdvi.toFixed(4)),
      ...cls,
      timeline: ndviTimeline,
      factors: {
        avg_soil_moisture: parseFloat(avgSoilMoisture.toFixed(4)),
        avg_temperature: parseFloat(avgTemp.toFixed(1)),
        total_precipitation_14d: parseFloat(totalPrecip.toFixed(1)),
        avg_evapotranspiration: parseFloat(avgET0.toFixed(2)),
      },
      source,
      image_captured_at: satellite?.image_captured_at ?? null,
      cloud_cover_pct: satellite?.cloud_cover_pct ?? null,
      weather_derived_ndvi: parseFloat(weatherDerivedNdvi.toFixed(4)),
      note: satellite
        ? 'Real Sentinel-2 NDVI from AgroMonitoring. Weather context shown for trend.'
        : 'No clear Sentinel-2 image in last 14 days. Showing weather-derived estimate (cloud cover or quota).',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('Satellite NDVI error:', error)
    return new Response(
      JSON.stringify({ error: 'Service temporarily unavailable.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
