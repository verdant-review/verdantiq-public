import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function WhatsAppReachPanel() {
  const [data, setData] = useState<{ day: string; count: number }[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data: rows } = await supabase
        .from("message_log")
        .select("created_at, channel")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(5000);
      const days: Record<string, number> = {};
      (rows || []).forEach((r: any) => {
        const d = r.created_at.slice(0, 10);
        days[d] = (days[d] || 0) + 1;
      });
      setData(Object.entries(days).map(([day, count]) => ({ day, count })));
      setTotal((rows || []).length);
    })();
  }, []);

  return (
    <div className="space-y-2">
      <div className="text-3xl font-bold">{total.toLocaleString()}</div>
      <div className="text-xs text-emerald-200">messages delivered (last 30 days)</div>
      {data.length > 0 && (
        <div style={{ width: "100%", height: 140 }}>
          <ResponsiveContainer>
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#065f46" />
              <XAxis dataKey="day" stroke="#a7f3d0" fontSize={10} tickFormatter={(d) => d.slice(5)} />
              <YAxis stroke="#a7f3d0" fontSize={10} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#064e3b", border: "1px solid #047857", color: "white", fontSize: 12 }} />
              <Area type="monotone" dataKey="count" stroke="#34d399" fill="#10b981" fillOpacity={0.4} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
