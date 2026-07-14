import React, { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapIcon } from "lucide-react";

// Fix default markers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

export interface OrgMapPoint {
  lat: number;
  lng: number;
  name: string;
  detail?: string;
  ndvi?: number | null;
}

interface Props {
  points: OrgMapPoint[];
  primary: string;
  title?: string;
  demo?: boolean;
  height?: number;
}

function ndviColor(v?: number | null) {
  if (v == null) return "#6b7280";
  if (v < 0.35) return "#dc2626";
  if (v < 0.55) return "#f59e0b";
  if (v < 0.7) return "#84cc16";
  return "#15803d";
}

const OrgGISMap: React.FC<Props> = ({ points, primary, title, demo, height = 380 }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  // init once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: false }).setView([-19.0, 29.8], 6);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Tiles &copy; Esri",
      maxZoom: 18,
    }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 18,
      opacity: 0.25,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // render markers
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const valid = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    valid.forEach((p) => {
      const c = L.circleMarker([p.lat, p.lng], {
        radius: 8,
        fillColor: ndviColor(p.ndvi),
        color: primary,
        weight: 2,
        fillOpacity: 0.85,
      });
      c.bindPopup(
        `<div style="min-width:160px"><strong>${p.name}</strong>${p.detail ? `<br/><span style="font-size:11px;opacity:0.7">${p.detail}</span>` : ""}${p.ndvi != null ? `<br/>NDVI: ${p.ndvi.toFixed(2)}` : ""}</div>`
      );
      c.addTo(layer);
    });

    if (valid.length) {
      const bounds = L.latLngBounds(valid.map((p) => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });
    }
  }, [points, primary]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MapIcon className="h-4 w-4" /> {title || "Field GIS map"}
        </CardTitle>
        <div className="flex items-center gap-2">
          {demo && <Badge variant="outline" className="text-xs">Demo data</Badge>}
          <span className="text-xs text-muted-foreground hidden sm:inline">{points.length} fields</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2 flex-wrap">
          <span>NDVI:</span>
          {[
            ["<0.35", "#dc2626"],
            ["0.35–0.55", "#f59e0b"],
            ["0.55–0.7", "#84cc16"],
            [">0.7", "#15803d"],
          ].map(([l, c]) => (
            <span key={l} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: c as string }} />
              {l}
            </span>
          ))}
        </div>
        <div ref={containerRef} style={{ height, width: "100%" }} className="rounded border" />
      </CardContent>
    </Card>
  );
};

export default OrgGISMap;

// Generate deterministic demo points around Zimbabwe agroecological zones from a slug-derived hash.
export function generateDemoPoints(slug: string, count: number, commodities: string[]): OrgMapPoint[] {
  let seed = 0;
  for (let i = 0; i < slug.length; i++) seed = (seed * 31 + slug.charCodeAt(i)) | 0;
  seed = Math.abs(seed) || 1;
  const rng = () => {
    seed = (seed * 9301 + 49297) % 233280;
    if (seed < 0) seed += 233280;
    return seed / 233280;
  };
  // Cluster centres in real Zimbabwean farming districts
  const clusters: { name: string; lat: number; lng: number }[] = [
    { name: "Bindura", lat: -17.30, lng: 31.33 },
    { name: "Mutoko", lat: -17.42, lng: 32.21 },
    { name: "Chipinge", lat: -20.20, lng: 32.62 },
    { name: "Gokwe", lat: -18.22, lng: 28.93 },
    { name: "Mberengwa", lat: -20.50, lng: 29.90 },
    { name: "Mhondoro", lat: -18.22, lng: 30.55 },
    { name: "Chegutu", lat: -18.13, lng: 30.15 },
    { name: "Marondera", lat: -18.19, lng: 31.55 },
  ];
  const names = [
    "T. Moyo", "C. Sibanda", "F. Ncube", "R. Dube", "T. Mhlanga",
    "N. Ndlovu", "B. Chigumba", "M. Hove", "T. Mpofu", "P. Banda",
    "S. Mlambo", "G. Chikomba", "K. Mutasa", "L. Zvavamwe", "E. Nyathi",
  ];
  const pts: OrgMapPoint[] = [];
  for (let i = 0; i < count; i++) {
    const c = clusters[Math.floor(rng() * clusters.length)];
    const lat = c.lat + (rng() - 0.5) * 0.35;
    const lng = c.lng + (rng() - 0.5) * 0.35;
    const ndvi = +(0.35 + rng() * 0.45).toFixed(2);
    pts.push({
      lat,
      lng,
      name: names[i % names.length],
      detail: `${c.name} · ${commodities[i % commodities.length]} · ${(0.4 + rng() * 3).toFixed(1)} ha`,
      ndvi,
    });
  }
  return pts;
}
