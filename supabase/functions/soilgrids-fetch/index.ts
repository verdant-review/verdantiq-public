// Fetches modelled soil baseline from ISRIC SoilGrids 250m for a farm centroid.
// Cached forever in soil_baseline (one row per farm).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SOILGRIDS_URL = "https://rest.isric.org/soilgrids/v2.0/properties/query";
const PROPERTIES = ["phh2o", "soc", "cec", "clay", "sand", "silt", "bdod", "nitrogen"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { farm_id } = await req.json();
    if (!farm_id) {
      return new Response(JSON.stringify({ error: "farm_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Skip if already cached
    const { data: existing } = await supabase
      .from("soil_baseline").select("id").eq("farm_id", farm_id).maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ cached: true, id: existing.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: farm, error: farmErr } = await supabase
      .from("farms").select("id, latitude, longitude").eq("id", farm_id).single();
    if (farmErr || !farm?.latitude || !farm?.longitude) {
      return new Response(JSON.stringify({ error: "farm has no coordinates" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SoilGrids v2.0 standard depths — request topsoil layers (0-5, 5-15, 15-30 cm)
    const params = new URLSearchParams({
      lon: String(farm.longitude),
      lat: String(farm.latitude),
    });
    PROPERTIES.forEach((p) => params.append("property", p));
    ["0-5cm", "5-15cm", "15-30cm"].forEach((d) => params.append("depth", d));
    ["mean"].forEach((v) => params.append("value", v));

    const resp = await fetch(`${SOILGRIDS_URL}?${params.toString()}`, {
      headers: { "Accept": "application/json" },
    });
    if (!resp.ok) throw new Error(`SoilGrids ${resp.status}`);
    const json = await resp.json();

    // Helper: average mean values across the topsoil depths returned, applying d_factor
    const getVal = (prop: string): number | null => {
      const layer = json?.properties?.layers?.find((l: any) => l.name === prop);
      if (!layer) return null;
      const factor = layer?.unit_measure?.d_factor ?? 1;
      const vals = (layer?.depths ?? [])
        .map((d: any) => d?.values?.mean)
        .filter((v: any) => typeof v === "number");
      if (vals.length === 0) return null;
      const avg = vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
      return avg / factor;
    };

    const insert = {
      farm_id,
      ph: getVal("phh2o"),
      organic_carbon_g_per_kg: getVal("soc"),
      cec_cmol_per_kg: getVal("cec"),
      clay_pct: getVal("clay"),
      sand_pct: getVal("sand"),
      silt_pct: getVal("silt"),
      bulk_density_kg_per_m3: getVal("bdod"),
      nitrogen_g_per_kg: getVal("nitrogen"),
      raw_response: json,
    };

    const { data, error } = await supabase.from("soil_baseline").insert(insert).select().single();
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, baseline: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
