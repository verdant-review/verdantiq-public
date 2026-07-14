import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { MapIcon, Layers, Save, Trash2, MapPin, Navigation, Search } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";

// Fix Leaflet default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface FarmMapProps {
  farm: {
    id: string;
    name: string;
    boundary?: any;
    latitude?: number | null;
    longitude?: number | null;
    location?: string;
  };
  onBoundaryUpdate?: (boundary: any, lat: number, lng: number) => void;
}

const TILE_LAYERS = {
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    name: "Satellite",
  },
  terrain: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors",
    name: "Terrain",
  },
  topo: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenTopoMap",
    name: "Topographic",
  },
};

const FarmMap: React.FC<FarmMapProps> = ({ farm, onBoundaryUpdate }) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const drawnItemsRef = useRef<L.FeatureGroup>(new L.FeatureGroup());
  const markerRef = useRef<L.Marker | null>(null);
  const [activeLayer, setActiveLayer] = useState<keyof typeof TILE_LAYERS>("satellite");
  const [saving, setSaving] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const [manualLat, setManualLat] = useState(farm.latitude ? String(farm.latitude) : "");
  const [manualLng, setManualLng] = useState(farm.longitude ? String(farm.longitude) : "");
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const pickModeRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    pickModeRef.current = pickMode;
  }, [pickMode]);

  const placeMarker = (lat: number, lng: number, map?: L.Map) => {
    const m = map || mapRef.current;
    if (!m) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      markerRef.current = L.marker([lat, lng]).addTo(m);
    }
    m.setView([lat, lng], Math.max(m.getZoom(), 15));
  };

  const goToCoordinates = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      toast({ title: "Invalid coordinates", description: "Enter valid latitude (-90 to 90) and longitude (-180 to 180).", variant: "destructive" });
      return;
    }
    placeMarker(lat, lng);
  };

  const saveLocation = async () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (isNaN(lat) || isNaN(lng)) {
      toast({ title: "No location set", description: "Click the map or enter coordinates first.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("farms")
        .update({ latitude: lat, longitude: lng } as any)
        .eq("id", farm.id);
      if (error) throw error;
      onBoundaryUpdate?.(farm.boundary, lat, lng);
      toast({ title: "Location saved", description: `GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)}` });
      setPickMode(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to save location", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const defaultCenter: [number, number] = [
      farm.latitude ? Number(farm.latitude) : -17.8292,
      farm.longitude ? Number(farm.longitude) : 31.0522,
    ];

    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: farm.boundary ? 15 : 13,
      zoomControl: true,
    });

    // Add initial tile layer
    const tile = TILE_LAYERS[activeLayer];
    tileLayerRef.current = L.tileLayer(tile.url, { attribution: tile.attribution, maxZoom: 19 }).addTo(map);

    // Add drawn items layer
    drawnItemsRef.current.addTo(map);

    // Add draw controls
    const drawControl = new (L.Control as any).Draw({
      position: "topright",
      draw: {
        polygon: {
          allowIntersection: false,
          shapeOptions: { color: "#16a34a", weight: 3, fillOpacity: 0.15 },
        },
        rectangle: {
          shapeOptions: { color: "#16a34a", weight: 3, fillOpacity: 0.15 },
        },
        polyline: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
      edit: {
        featureGroup: drawnItemsRef.current,
        remove: true,
      },
    });
    map.addControl(drawControl);

    // Handle draw events
    map.on("draw:created" as any, (e: any) => {
      drawnItemsRef.current.clearLayers();
      drawnItemsRef.current.addLayer(e.layer);
    });

    // Handle click-to-place location
    map.on("click", (e: L.LeafletMouseEvent) => {
      if (!pickModeRef.current) return;
      placeMarker(e.latlng.lat, e.latlng.lng, map);
      setManualLat(e.latlng.lat.toFixed(6));
      setManualLng(e.latlng.lng.toFixed(6));
    });

    // Load existing boundary
    if (farm.boundary) {
      try {
        const geoJson = typeof farm.boundary === "string" ? JSON.parse(farm.boundary) : farm.boundary;
        const layer = L.geoJSON(geoJson, {
          style: { color: "#16a34a", weight: 3, fillOpacity: 0.15 },
        });
        layer.eachLayer((l) => drawnItemsRef.current.addLayer(l));
        map.fitBounds(drawnItemsRef.current.getBounds(), { padding: [30, 30] });
      } catch (err) {
        console.error("Error loading boundary:", err);
      }
    }

    // Place existing marker if coordinates exist
    if (farm.latitude && farm.longitude) {
      placeMarker(Number(farm.latitude), Number(farm.longitude), map);
    }

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Switch tile layers
  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) return;
    mapRef.current.removeLayer(tileLayerRef.current);
    const tile = TILE_LAYERS[activeLayer];
    tileLayerRef.current = L.tileLayer(tile.url, { attribution: tile.attribution, maxZoom: 19 }).addTo(mapRef.current);
  }, [activeLayer]);

  const saveBoundary = async () => {
    const layers = drawnItemsRef.current.getLayers();
    if (layers.length === 0) {
      toast({ title: "No boundary drawn", description: "Draw a polygon on the map first.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const geoJson = drawnItemsRef.current.toGeoJSON();
      const feature = (geoJson as any).features?.[0];
      if (!feature) throw new Error("No feature found");

      // Calculate centroid
      const coords = feature.geometry.coordinates[0];
      let latSum = 0, lngSum = 0;
      coords.forEach((c: number[]) => { lngSum += c[0]; latSum += c[1]; });
      const centroidLat = latSum / coords.length;
      const centroidLng = lngSum / coords.length;

      const boundaryGeoJson = JSON.stringify(feature.geometry);

      const { error } = await supabase.rpc('update_farm_boundary' as any, {
        farm_id: farm.id,
        boundary_geojson: boundaryGeoJson,
        lat: centroidLat,
        lng: centroidLng,
      });

      if (error) throw error;

      onBoundaryUpdate?.(feature.geometry, centroidLat, centroidLng);
      toast({ title: "Boundary saved", description: `Farm boundary updated. GPS: ${centroidLat.toFixed(4)}, ${centroidLng.toFixed(4)}` });
    } catch (err: any) {
      console.error("Save boundary error:", err);
      toast({ title: "Error", description: err.message || "Failed to save boundary", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const clearBoundary = () => {
    drawnItemsRef.current.clearLayers();
  };

  return (
    <Card className="border-primary/20 shadow-sm">
      <CardHeader className="bg-primary/5 border-b pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-primary flex items-center gap-2">
            <MapIcon className="h-5 w-5" />
            Farm Intelligence Map
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Layer switcher */}
            {(Object.keys(TILE_LAYERS) as (keyof typeof TILE_LAYERS)[]).map((key) => (
              <Button
                key={key}
                size="sm"
                variant={activeLayer === key ? "default" : "outline"}
                onClick={() => setActiveLayer(key)}
                className={activeLayer === key ? "bg-primary hover:bg-primary/90" : ""}
              >
                <Layers className="h-3 w-3 mr-1" />
                {TILE_LAYERS[key].name}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Button size="sm" onClick={saveBoundary} disabled={saving} className="bg-primary hover:bg-primary/90">
            <Save className="h-3 w-3 mr-1" />
            {saving ? "Saving..." : "Save Boundary"}
          </Button>
          <Button
            size="sm"
            variant={pickMode ? "default" : "outline"}
            onClick={() => setPickMode(!pickMode)}
            className={pickMode ? "bg-primary hover:bg-primary/90 animate-pulse" : ""}
          >
            <MapPin className="h-3 w-3 mr-1" />
            {pickMode ? "Click Map to Place" : "Pick Location"}
          </Button>
          <Button size="sm" variant="outline" onClick={clearBoundary} className="border-destructive/30 text-destructive hover:bg-destructive/10">
            <Trash2 className="h-3 w-3 mr-1" />
            Clear
          </Button>
          {farm.latitude && farm.longitude && (
            <Badge variant="secondary">
              GPS: {Number(farm.latitude).toFixed(4)}, {Number(farm.longitude).toFixed(4)}
            </Badge>
          )}
          {farm.boundary && (
            <Badge variant="secondary">
              Boundary Mapped
            </Badge>
          )}
        </div>
        {/* Coordinate input section */}
        <div className="flex items-end gap-2 mt-3 flex-wrap">
          <div className="flex-1 min-w-[120px]">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Latitude</label>
            <Input
              type="number"
              step="any"
              placeholder="-17.8292"
              value={manualLat}
              onChange={(e) => setManualLat(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Longitude</label>
            <Input
              type="number"
              step="any"
              placeholder="31.0522"
              value={manualLng}
              onChange={(e) => setManualLng(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <Button size="sm" variant="outline" onClick={goToCoordinates} className="h-8">
            <Search className="h-3 w-3 mr-1" />
            Go
          </Button>
          <Button size="sm" onClick={saveLocation} disabled={saving} className="h-8 bg-primary hover:bg-primary/90">
            <Navigation className="h-3 w-3 mr-1" />
            Save Location
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 relative">
        {pickMode && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-medium shadow-lg">
            Click anywhere on the map to set your farm location
          </div>
        )}
        <div ref={mapContainerRef} className="h-[400px] w-full rounded-b-lg" />
      </CardContent>
    </Card>
  );
};

export default FarmMap;
