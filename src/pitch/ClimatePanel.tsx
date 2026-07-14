import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type Alert = { id: string; alert_type: string; severity: string; message: string; created_at: string; expires_at: string | null; farm_id: string };

export default function ClimatePanel() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [byType, setByType] = useState<{ type: string; count: number }[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("weather_alerts" as any)
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(200);
      const list = ((data as unknown) as Alert[]) || [];
      setAlerts(list.slice(0, 8));
      const counts: Record<string, number> = {};
      list.forEach((a) => { counts[a.alert_type] = (counts[a.alert_type] || 0) + 1; });
      setByType(Object.entries(counts).map(([type, count]) => ({ type, count })));
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div style={{ width: "100%", height: 140 }}>
        <ResponsiveContainer>
          <BarChart data={byType}>
            <CartesianGrid strokeDasharray="3 3" stroke="#065f46" />
            <XAxis dataKey="type" stroke="#a7f3d0" fontSize={11} />
            <YAxis stroke="#a7f3d0" fontSize={11} allowDecimals={false} />
            <Tooltip contentStyle={{ background: "#064e3b", border: "1px solid #047857", color: "white", fontSize: 12 }} />
            <Bar dataKey="count" fill="#fbbf24" minPointSize={3} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-1.5 max-h-44 overflow-auto pr-2">
        {alerts.length === 0 && <div className="text-sm text-emerald-300">No active climate alerts.</div>}
        {alerts.map((a) => (
          <div key={a.id} className="flex items-start justify-between gap-2 text-xs bg-emerald-800/50 rounded p-2">
            <div className="flex-1">
              <div className="font-semibold capitalize">{a.alert_type}</div>
              <div className="text-emerald-200 line-clamp-2">{a.message}</div>
            </div>
            <Badge className={a.severity === "critical" ? "bg-red-600" : a.severity === "warning" ? "bg-amber-500 text-black" : "bg-emerald-700"}>
              {a.severity}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
