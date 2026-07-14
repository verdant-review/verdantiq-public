import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";

type Row = { day: string; region_code: string | null; region_name: string | null; avg_ndvi: number; sample_count: number };

const ZONE_COLORS: Record<string, string> = {
  I: "#22c55e", IIa: "#34d399", IIb: "#a3e635",
  III: "#facc15", IV: "#fb923c", Va: "#f87171", Vb: "#dc2626",
};

export default function NdviTimeSeries() {
  const [data, setData] = useState<any[]>([]);
  const [zones, setZones] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const { data: rows } = await supabase
        .from("v_national_ndvi_daily" as any)
        .select("*")
        .order("day", { ascending: true });
      const list = ((rows as unknown) as Row[]) || [];
      const byDay: Record<string, any> = {};
      const zoneSet = new Set<string>();
      list.forEach((r) => {
        const code = r.region_code || "Unknown";
        zoneSet.add(code);
        const key = r.day;
        if (!byDay[key]) byDay[key] = { day: key };
        byDay[key][code] = Number(r.avg_ndvi);
      });
      const arr = Object.values(byDay).sort((a: any, b: any) => a.day.localeCompare(b.day));
      // national average
      arr.forEach((row: any) => {
        const vals = Array.from(zoneSet).map((z) => row[z]).filter((v) => typeof v === "number");
        row.National = vals.length ? +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(3) : null;
      });
      setData(arr);
      setZones(Array.from(zoneSet));
    })();
  }, []);

  if (!data.length) {
    return <div className="text-sm text-emerald-300">No NDVI history yet — readings will appear as satellite data is captured.</div>;
  }

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#065f46" />
          <XAxis dataKey="day" stroke="#a7f3d0" fontSize={11} tickFormatter={(d) => d.slice(5)} />
          <YAxis stroke="#a7f3d0" fontSize={11} domain={[0, 1]} />
          <Tooltip
            contentStyle={{ background: "#064e3b", border: "1px solid #047857", color: "white", fontSize: 12 }}
            labelStyle={{ color: "#a7f3d0" }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "white" }} />
          <Line type="monotone" dataKey="National" stroke="#fef08a" strokeWidth={2.5} dot={false} />
          {zones.map((z) => (
            <Line key={z} type="monotone" dataKey={z} stroke={ZONE_COLORS[z] || "#10b981"} strokeWidth={1.2} dot={false} opacity={0.75} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
