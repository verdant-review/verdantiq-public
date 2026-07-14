import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function LivestockPanel() {
  const [bySpecies, setBySpecies] = useState<{ species: string; count: number }[]>([]);
  const [eventsTimeline, setEventsTimeline] = useState<{ day: string; count: number }[]>([]);

  useEffect(() => {
    (async () => {
      const { data: herds } = await supabase.from("livestock_herds").select("species, herd_size");
      const map: Record<string, number> = {};
      (herds || []).forEach((h: any) => { map[h.species] = (map[h.species] || 0) + Number(h.herd_size || 0); });
      setBySpecies(Object.entries(map).map(([species, count]) => ({ species, count })).sort((a, b) => b.count - a.count));

      const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const { data: events } = await supabase
        .from("livestock_events")
        .select("event_date")
        .gte("event_date", since);
      const days: Record<string, number> = {};
      (events || []).forEach((e: any) => { days[e.event_date] = (days[e.event_date] || 0) + 1; });
      setEventsTimeline(Object.entries(days).map(([day, count]) => ({ day, count })).sort((a, b) => a.day.localeCompare(b.day)));
    })();
  }, []);

  if (!bySpecies.length) return <div className="text-sm text-emerald-300">No livestock herds registered yet.</div>;

  return (
    <div className="space-y-3">
      <div style={{ width: "100%", height: 160 }}>
        <ResponsiveContainer>
          <BarChart data={bySpecies}>
            <CartesianGrid strokeDasharray="3 3" stroke="#065f46" />
            <XAxis dataKey="species" stroke="#a7f3d0" fontSize={11} />
            <YAxis stroke="#a7f3d0" fontSize={11} />
            <Tooltip contentStyle={{ background: "#064e3b", border: "1px solid #047857", color: "white", fontSize: 12 }} />
            <Bar dataKey="count" fill="#a78bfa" minPointSize={3} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="text-xs text-emerald-200">Events (last 90d): {eventsTimeline.reduce((s, e) => s + e.count, 0)}</div>
    </div>
  );
}
