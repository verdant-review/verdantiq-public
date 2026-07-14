import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sun, Sprout, Beef, ListTodo } from "lucide-react";

interface Item {
  id: string;
  kind: "task" | "livestock" | "weather";
  title: string;
  subtitle?: string;
  date?: string;
}

interface Props {
  farmId: string;
}

const TodayOnTheFarm: React.FC<Props> = ({ farmId }) => {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!farmId) return;
    const load = async () => {
      setLoading(true);
      const today = new Date();
      const upcoming = new Date();
      upcoming.setDate(upcoming.getDate() + 7);

      // Crop tasks
      const { data: cycles } = await (supabase as any)
        .from("crop_cycles").select("id, crop_type").eq("farm_id", farmId);
      const cycleIds = (cycles || []).map((c: any) => c.id);
      let tasks: any[] = [];
      if (cycleIds.length > 0) {
        const { data } = await (supabase as any)
          .from("cycle_tasks")
          .select("id, task_name, due_date, is_completed, crop_cycle_id")
          .in("crop_cycle_id", cycleIds)
          .eq("is_completed", false)
          .lte("due_date", upcoming.toISOString().slice(0, 10))
          .order("due_date", { ascending: true })
          .limit(5);
        tasks = data || [];
      }

      // Livestock events upcoming
      const { data: herds } = await (supabase as any)
        .from("livestock_herds").select("id, species").eq("farm_id", farmId);
      const herdIds = (herds || []).map((h: any) => h.id);
      let lvEvents: any[] = [];
      if (herdIds.length > 0) {
        const { data } = await (supabase as any)
          .from("livestock_events")
          .select("id, event_type, event_date, herd_id")
          .in("herd_id", herdIds)
          .gte("event_date", today.toISOString().slice(0, 10))
          .order("event_date", { ascending: true })
          .limit(5);
        lvEvents = data || [];
      }

      // Active weather alerts
      const { data: alerts } = await (supabase as any)
        .from("weather_alerts")
        .select("id, alert_type, message, severity, created_at")
        .eq("farm_id", farmId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(3);

      const merged: Item[] = [
        ...(alerts || []).map((a: any) => ({
          id: `w-${a.id}`, kind: "weather" as const, title: a.alert_type,
          subtitle: a.message, date: a.created_at?.slice(0, 10),
        })),
        ...tasks.map((t: any) => {
          const cycle = cycles?.find((c: any) => c.id === t.crop_cycle_id);
          return {
            id: `t-${t.id}`, kind: "task" as const, title: t.task_name,
            subtitle: cycle?.crop_type, date: t.due_date,
          };
        }),
        ...lvEvents.map((e: any) => {
          const herd = herds?.find((h: any) => h.id === e.herd_id);
          return {
            id: `l-${e.id}`, kind: "livestock" as const, title: `${e.event_type}`,
            subtitle: herd?.species, date: e.event_date,
          };
        }),
      ];

      setItems(merged);
      setLoading(false);
    };
    load();
  }, [farmId]);

  const iconFor = (k: Item["kind"]) =>
    k === "task" ? <Sprout className="h-4 w-4 text-green-600" /> :
    k === "livestock" ? <Beef className="h-4 w-4 text-orange-600" /> :
    <Sun className="h-4 w-4 text-blue-600" />;

  return (
    <Card className="bg-gradient-to-br from-emerald-50 to-amber-50 border-emerald-200 shadow-sm">
      <CardHeader className="border-b border-emerald-200">
        <CardTitle className="text-emerald-900 flex items-center">
          <ListTodo className="h-5 w-5 mr-2" />
          Today on the Farm
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nothing pending in the next 7 days. Enjoy the calm 🌾</p>
        ) : (
          <ul className="space-y-2">
            {items.map((i) => (
              <li key={i.id} className="flex items-center justify-between bg-white/70 rounded-md p-2">
                <div className="flex items-center gap-2">
                  {iconFor(i.kind)}
                  <div>
                    <div className="font-medium text-sm capitalize">{i.title}</div>
                    {i.subtitle && <div className="text-xs text-muted-foreground">{i.subtitle}</div>}
                  </div>
                </div>
                {i.date && <Badge variant="outline" className="text-xs">{i.date}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default TodayOnTheFarm;
