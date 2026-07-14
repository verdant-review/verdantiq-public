import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type FarmNdvi = {
  farm_id: string;
  farm_name: string;
  latitude: number;
  longitude: number;
  region_code: string | null;
  region_name: string | null;
  ndvi_value: number | null;
  captured_at: string | null;
};

const ZONE_COLORS: Record<string, string> = {
  I: "#16a34a", IIa: "#22c55e", IIb: "#65a30d",
  III: "#eab308", IV: "#f97316", Va: "#ef4444", Vb: "#b91c1c",
};

function ndviColor(v: number | null): string {
  if (v === null || v === undefined) return "#6b7280";
  if (v < 0.3) return "#dc2626";
  if (v < 0.5) return "#f59e0b";
  if (v < 0.7) return "#84cc16";
  return "#15803d";
}

export default function NationalNdviMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayer = useRef<L.LayerGroup | null>(null);
  const heatLayer = useRef<any>(null);
  const zonesLayer = useRef<L.GeoJSON | null>(null);
  const [mode, setMode] = useState<"markers" | "heatmap" | "both">("both");
  const [loading, setLoading] = useState(true);
  const [farms, setFarms] = useState<FarmNdvi[]>([]);

  // init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true }).setView([-19.0, 29.8], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 18,
    }).addTo(map);
    mapRef.current = map;
    markersLayer.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // load data
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: ndvi }, { data: zonesGeo }] = await Promise.all([
        supabase.rpc("get_latest_farm_ndvi" as any),
        supabase.rpc("get_zones_geojson" as any),
      ]);
      const list = (ndvi as FarmNdvi[]) || [];
      setFarms(list);

      const map = mapRef.current;
      if (!map) return;

      // zones overlay
      if (zonesLayer.current) zonesLayer.current.remove();
      if (zonesGeo) {
        zonesLayer.current = L.geoJSON(zonesGeo as any, {
          style: (f: any) => ({
            color: ZONE_COLORS[f.properties?.region_code] || "#10b981",
            weight: 1.2,
            fillColor: ZONE_COLORS[f.properties?.region_code] || "#10b981",
            fillOpacity: 0.12,
          }),
          onEachFeature: (f, layer) => {
            const p = f.properties || {};
            layer.bindPopup(
              `<strong>${p.region_name || p.region_code}</strong><br/>Rainfall: ${p.rainfall_min_mm ?? "—"}–${p.rainfall_max_mm ?? "—"} mm`
            );
          },
        }).addTo(map);
      }
      setLoading(false);
    })();
  }, []);

  // render markers / heat based on mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersLayer.current?.clearLayers();
    if (heatLayer.current) {
      map.removeLayer(heatLayer.current);
      heatLayer.current = null;
    }

    if (mode === "markers" || mode === "both") {
      farms.forEach((f) => {
        if (f.latitude == null || f.longitude == null) return;
        const c = L.circleMarker([f.latitude, f.longitude], {
          radius: 8,
          fillColor: ndviColor(f.ndvi_value),
          color: "#0f172a",
          weight: 1,
          fillOpacity: 0.9,
        });
        c.bindPopup(
          `<div style="min-width:160px"><strong>${f.farm_name}</strong><br/>Zone: ${f.region_name || "—"}<br/>NDVI: ${f.ndvi_value?.toFixed(2) ?? "n/a"}<br/>${f.captured_at ? new Date(f.captured_at).toLocaleDateString() : "no data"}</div>`
        );
        c.addTo(markersLayer.current!);
      });
    }

    if (mode === "heatmap" || mode === "both") {
      const points = farms
        .filter((f) => f.latitude != null && f.longitude != null && f.ndvi_value != null)
        .map((f) => [f.latitude, f.longitude, Math.max(0, Math.min(1, 1 - (f.ndvi_value || 0)))]);
      // @ts-ignore — leaflet.heat plugin
      heatLayer.current = L.heatLayer(points, {
        radius: 35, blur: 25, maxZoom: 10,
        gradient: { 0.2: "#15803d", 0.4: "#84cc16", 0.6: "#f59e0b", 0.8: "#dc2626", 1: "#7f1d1d" },
      }).addTo(map);
    }
  }, [mode, farms]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1">
          {(["markers", "heatmap", "both"] as const).map((m) => (
            <Button
              key={m}
              size="sm"
              variant={mode === m ? "default" : "outline"}
              onClick={() => setMode(m)}
              className="capitalize"
            >
              {m}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="opacity-70">NDVI:</span>
          {[
            ["<0.3", "#dc2626"],
            ["0.3–0.5", "#f59e0b"],
            ["0.5–0.7", "#84cc16"],
            [">0.7", "#15803d"],
          ].map(([label, color]) => (
            <span key={label} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full inline-block" style={{ background: color as string }} />
              {label}
            </span>
          ))}
        </div>
      </div>
      <div className="relative rounded-lg overflow-hidden border border-emerald-700">
        {loading && (
          <div className="absolute inset-0 z-[400] flex items-center justify-center bg-emerald-950/60 text-white">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading national vegetation data…
          </div>
        )}
        <div ref={containerRef} style={{ height: 480, width: "100%" }} />
      </div>
      <div className="text-xs text-emerald-300">
        {farms.length} farms mapped · {farms.filter((f) => f.ndvi_value != null).length} with NDVI readings
      </div>
    </div>
  );
}
