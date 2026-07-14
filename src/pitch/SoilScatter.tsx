import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ZAxis } from "recharts";

export default function SoilScatter() {
  const [points, setPoints] = useState<{ ph: number; oc: number; name: string }[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("soil_baseline")
        .select("ph, organic_carbon_g_per_kg, farm_id, farms(name)")
        .not("ph", "is", null);
      setPoints(
        (data || [])
          .filter((d: any) => d.organic_carbon_g_per_kg != null)
          .map((d: any) => ({
            ph: Number(d.ph),
            oc: Number(d.organic_carbon_g_per_kg),
            name: d.farms?.name || "Farm",
          }))
      );
    })();
  }, []);

  if (!points.length) return <div className="text-sm text-emerald-300">No soil baseline yet.</div>;

  return (
    <div style={{ width: "100%", height: 180 }}>
      <ResponsiveContainer>
        <ScatterChart>
          <CartesianGrid stroke="#065f46" />
          <XAxis type="number" dataKey="ph" name="pH" stroke="#a7f3d0" fontSize={11} domain={[3, 9]} label={{ value: "pH", position: "bottom", fill: "#a7f3d0", fontSize: 10 }} />
          <YAxis type="number" dataKey="oc" name="OC g/kg" stroke="#a7f3d0" fontSize={11} label={{ value: "OC g/kg", angle: -90, position: "insideLeft", fill: "#a7f3d0", fontSize: 10 }} />
          <ZAxis range={[60, 60]} />
          <Tooltip contentStyle={{ background: "#064e3b", border: "1px solid #047857", color: "white", fontSize: 12 }} />
          <Scatter data={points} fill="#fbbf24" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
