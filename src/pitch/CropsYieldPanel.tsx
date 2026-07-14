import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Badge } from "@/components/ui/badge";

export default function CropsYieldPanel() {
  const [data, setData] = useState<{ crop: string; predicted: number; actual: number; area: number }[]>([]);

  useEffect(() => {
    (async () => {
      const { data: cycles } = await supabase
        .from("crop_cycles")
        .select("crop_type, area_hectares, predicted_yield_tonnes, actual_yield_tonnes");
      const map: Record<string, { predicted: number; actual: number; area: number }> = {};
      (cycles || []).forEach((c: any) => {
        const k = c.crop_type;
        if (!map[k]) map[k] = { predicted: 0, actual: 0, area: 0 };
        map[k].predicted += Number(c.predicted_yield_tonnes || 0);
        map[k].actual += Number(c.actual_yield_tonnes || 0);
        map[k].area += Number(c.area_hectares || 0);
      });
      setData(
        Object.entries(map)
          .map(([crop, v]) => ({ crop, ...v, predicted: Math.round(v.predicted), actual: Math.round(v.actual), area: Math.round(v.area) }))
          .sort((a, b) => b.area - a.area)
          .slice(0, 7)
      );
    })();
  }, []);

  if (!data.length) return <div className="text-sm text-emerald-300">No crop cycles registered yet.</div>;

  return (
    <div className="space-y-3">
      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#065f46" />
            <XAxis dataKey="crop" stroke="#a7f3d0" fontSize={11} />
            <YAxis stroke="#a7f3d0" fontSize={11} />
            <Tooltip contentStyle={{ background: "#064e3b", border: "1px solid #047857", color: "white", fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11, color: "white" }} />
            <Bar dataKey="predicted" fill="#fbbf24" name="Predicted (t)" minPointSize={3} isAnimationActive={false} />
            <Bar dataKey="actual" fill="#34d399" name="Actual (t)" minPointSize={3} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-2">
        {data.map((d) => (
          <Badge key={d.crop} variant="secondary" className="bg-emerald-800 text-white capitalize">
            {d.crop}: {d.area} ha
          </Badge>
        ))}
      </div>
    </div>
  );
}
