import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapIcon, Sprout } from "lucide-react";
import OrgGISMap, { OrgMapPoint } from "./OrgGISMap";

interface Props {
  organizationId: string;
  primary: string;
}

// Lightweight wrapper that loads real enrolled-farm coordinates for this org.
const OrgLiveMap: React.FC<Props> = ({ organizationId, primary }) => {
  const [points, setPoints] = useState<OrgMapPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      // 1) get schemes for this org
      const { data: schemes } = await supabase
        .from("schemes")
        .select("id, name")
        .eq("organization_id", organizationId);

      const schemeIds = (schemes || []).map((s: any) => s.id);
      if (!schemeIds.length) {
        if (!cancelled) { setPoints([]); setLoading(false); }
        return;
      }

      // 2) enrollments → farmer_user_id + field_id
      const { data: enrolls } = await supabase
        .from("scheme_enrollments")
        .select("farmer_user_id, field_id, scheme_id")
        .in("scheme_id", schemeIds)
        .eq("status", "active" as any);

      const farmerIds = Array.from(new Set((enrolls || []).map((e: any) => e.farmer_user_id).filter(Boolean)));
      if (!farmerIds.length) {
        if (!cancelled) { setPoints([]); setLoading(false); }
        return;
      }

      // 3) farms with coordinates owned by enrolled farmers
      const { data: farms } = await (supabase as any)
        .from("farms")
        .select("id, name, latitude, longitude, location, user_id")
        .in("user_id", farmerIds);

      const pts: OrgMapPoint[] = (farms || [])
        .filter((f: any) => f.latitude != null && f.longitude != null)
        .map((f: any) => ({
          lat: Number(f.latitude),
          lng: Number(f.longitude),
          name: f.name,
          detail: f.location || "Enrolled farm",
          ndvi: null,
        }));

      if (!cancelled) {
        setPoints(pts);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [organizationId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><MapIcon className="h-4 w-4" /> Live field GIS</CardTitle>
        </CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Loading enrolled fields…</p></CardContent>
      </Card>
    );
  }

  if (!points.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><MapIcon className="h-4 w-4" /> Live field GIS</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground border-dashed border rounded p-6 text-center">
            <Sprout className="h-8 w-8 mx-auto mb-2 opacity-60" />
            <p className="font-medium text-foreground">No enrolled farms with GPS yet</p>
            <p className="mt-1">As you onboard farmers and they pin their farm boundaries, they will appear here in real time.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return <OrgGISMap points={points} primary={primary} title="Live field GIS · enrolled farms" />;
};

export default OrgLiveMap;
