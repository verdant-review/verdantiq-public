import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WeatherLocation {
  region: string;
  latitude: number;
  longitude: number;
}

// Lookup helper ONLY — never iterated. Used when a caller passes a region name without coordinates.
const zimbabweLocations: WeatherLocation[] = [
  { region: "Harare", latitude: -17.8277, longitude: 31.0534 },
  { region: "Bulawayo", latitude: -20.15, longitude: 28.5833 },
  { region: "Mutare", latitude: -18.9707, longitude: 32.6709 },
  { region: "Gweru", latitude: -19.45, longitude: 29.8167 },
  { region: "Chinhoyi", latitude: -16.8099, longitude: 29.6925 },
  { region: "Masvingo", latitude: -17.0333, longitude: 30.85 },
  { region: "Rusape", latitude: -18.2159, longitude: 32.7411 },
  { region: "Kwekwe", latitude: -17.504, longitude: 30.9739 }
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders }
)
  }

  // Lightweight health check probe (used by /status page)
  try {
    const u = new URL(req.url);
    if (u.searchParams.get('healthcheck') === '1') {
      return new Response(JSON.stringify({ ok: true, fn: 'weather-data' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }
  } catch (_) { /* noop */ }


  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { region, latitude, longitude, forecast } = await req.json()

    // Resolve to a SINGLE location. Coordinates take priority; region name is a fallback lookup.
    let location: WeatherLocation | null = null;
    if (latitude !== undefined && latitude !== null && longitude !== undefined && longitude !== null) {
      location = {
        region: region || "Your Farm",
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
      };
    } else if (region) {
      location = zimbabweLocations.find(loc =>
        loc.region.toLowerCase().includes(String(region).toLowerCase())
      ) || null;
    }

    if (!location) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing location. Provide latitude+longitude or a known region name.",
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Forecast branch
    if (forecast) {
      try {
        const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,weather_code&models=best_match&timezone=Africa/Harare`;
        const response = await fetch(forecastUrl);
        if (!response.ok) throw new Error('Forecast API failed');
        const data = await response.json();

        const forecastData = data.daily.time.slice(0, 7).map((date: string, index: number) => ({
          date,
          temperature_max: data.daily.temperature_2m_max[index],
          temperature_min: data.daily.temperature_2m_min[index],
          rainfall: data.daily.precipitation_sum[index] || 0,
          precipitation_probability: data.daily.precipitation_probability_max?.[index] || 0,
          wind_speed: data.daily.wind_speed_10m_max[index],
          condition: getWeatherCondition(data.daily.weather_code[index])
        }));

        return new Response(
          JSON.stringify({ success: true, forecast: forecastData, location }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        console.error('Forecast fetch error:', error);
        return new Response(
          JSON.stringify({ success: false, forecast: [], error: 'Service temporarily unavailable.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Current conditions — coordinate-keyed cache (2 decimals ≈ ~1km granularity)
    const cacheKey = `${location.latitude.toFixed(2)}_${location.longitude.toFixed(2)}`;
    const weatherData: any[] = [];

    console.log(`Processing weather data for ${location.region} (${cacheKey})`);

    const { data: cachedData } = await supabase
      .from('weather_cache')
      .select('*')
      .eq('region', cacheKey)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (cachedData) {
      console.log(`Using cached data for ${cacheKey}`);
      weatherData.push({ ...cachedData, region: location.region });
    } else {
      try {
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code&hourly=temperature_2m,precipitation,wind_speed_10m,soil_temperature_0cm,soil_temperature_6cm,soil_temperature_18cm,soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm,soil_moisture_9_to_27cm&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&models=best_match&timezone=Africa/Harare`;

        const response = await fetch(weatherUrl);
        if (!response.ok) {
          throw new Error(`OpenMeteo API returned ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        if (!data.current) throw new Error(`Invalid response format from OpenMeteo`);

        const weatherInfo = {
          region: location.region,
          latitude: location.latitude,
          longitude: location.longitude,
          temperature: data.current.temperature_2m,
          humidity: data.current.relative_humidity_2m,
          rainfall: data.current.precipitation || 0,
          wind_speed: data.current.wind_speed_10m,
          soil_temperature_0cm: data.hourly.soil_temperature_0cm?.[0],
          soil_temperature_6cm: data.hourly.soil_temperature_6cm?.[0],
          soil_temperature_18cm: data.hourly.soil_temperature_18cm?.[0],
          soil_moisture_0_1cm: data.hourly.soil_moisture_0_to_1cm?.[0],
          soil_moisture_1_3cm: data.hourly.soil_moisture_1_to_3cm?.[0],
          condition: getWeatherCondition(data.current.weather_code),
          forecast_data: {
            daily: data.daily,
            hourly: {
              temperature_2m: data.hourly.temperature_2m?.slice(0, 24) || [],
              precipitation: data.hourly.precipitation?.slice(0, 24) || [],
              wind_speed_10m: data.hourly.wind_speed_10m?.slice(0, 24) || [],
              soil_temperature_0cm: data.hourly.soil_temperature_0cm?.slice(0, 24) || [],
              soil_temperature_6cm: data.hourly.soil_temperature_6cm?.slice(0, 24) || [],
              soil_temperature_18cm: data.hourly.soil_temperature_18cm?.slice(0, 24) || [],
              soil_moisture_0_to_1cm: data.hourly.soil_moisture_0_to_1cm?.slice(0, 24) || [],
              soil_moisture_1_to_3cm: data.hourly.soil_moisture_1_to_3cm?.slice(0, 24) || [],
              soil_moisture_3_to_9cm: data.hourly.soil_moisture_3_to_9cm?.slice(0, 24) || [],
              soil_moisture_9_to_27cm: data.hourly.soil_moisture_9_to_27cm?.slice(0, 24) || []
            }
          },
          cached_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          data_source: 'openmeteo_live'
        };

        const cacheRecord = {
          region: cacheKey,
          latitude: weatherInfo.latitude,
          longitude: weatherInfo.longitude,
          temperature: weatherInfo.temperature,
          humidity: weatherInfo.humidity,
          rainfall: weatherInfo.rainfall,
          wind_speed: weatherInfo.wind_speed,
          soil_temperature_0cm: weatherInfo.soil_temperature_0cm,
          soil_temperature_6cm: weatherInfo.soil_temperature_6cm,
          soil_temperature_18cm: weatherInfo.soil_temperature_18cm,
          soil_moisture_0_1cm: weatherInfo.soil_moisture_0_1cm,
          soil_moisture_1_3cm: weatherInfo.soil_moisture_1_3cm,
          condition: weatherInfo.condition,
          forecast_data: weatherInfo.forecast_data,
          cached_at: weatherInfo.cached_at,
          expires_at: weatherInfo.expires_at,
        };

        const { error: cacheError } = await supabase
          .from('weather_cache')
          .upsert(cacheRecord, { onConflict: 'region' });
        if (cacheError) console.error(`Cache error:`, cacheError);

        weatherData.push(weatherInfo);
      } catch (apiError) {
        console.error(`OpenMeteo API failed for ${cacheKey}:`, apiError);
        const { data: fallbackData } = await supabase
          .from('weather_cache')
          .select('*')
          .eq('region', cacheKey)
          .order('cached_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (fallbackData) {
          weatherData.push({
            ...fallbackData,
            region: location.region,
            data_source: 'cached_fallback',
            fallback_reason: apiError.message,
          });
        } else {
          weatherData.push({
            region: location.region,
            latitude: location.latitude,
            longitude: location.longitude,
            temperature: 25,
            humidity: 60,
            rainfall: 0,
            wind_speed: 10,
            condition: "Data Unavailable",
            cached_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            data_source: 'default_fallback',
            fallback_reason: `API Error: ${apiError.message}`,
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: weatherData,
        timestamp: new Date().toISOString(),
        total_locations: weatherData.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Weather function error:', error);
    return new Response(
      JSON.stringify({ error: 'Service temporarily unavailable.', timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
})

function getWeatherCondition(code: number): string {
  const weatherCodes: { [key: number]: string } = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Foggy", 48: "Depositing rime fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
    95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail"
  };
  return weatherCodes[code] || "Unknown";
}
