import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Users, MessageCircle, Activity, RefreshCw, Loader2 } from "lucide-react";

interface Stats {
  totalProfiles: number;
  newProfiles7d: number;
  wau: number; // weekly active (web)
  mau: number; // monthly active (web)
  events7d: number;
  totalWaSessions: number;
  linkedWaSessions: number;
  anonWaSessions: number;
  waEnabledUsers: number;
  waActiveUsers7d: number;
  waMessages7d: number;
}

interface FeatureRow {
  event_name: string;
  unique_users: number;
  total: number;
  last_seen: string;
}

const UsersChannelsAdmin = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [features, setFeatures] = useState<FeatureRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const since7 = new Date(Date.now() - 7 * 86400_000).toISOString();
      const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();

      const [
        { count: totalProfiles },
        { count: newProfiles7d },
        { data: events7dData },
        { data: events30dData },
        { count: events7dCount },
        { count: totalWa },
        { count: linkedWa },
        { count: waEnabled },
        { data: waMsgs },
      ] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since7),
        supabase.from("usage_events").select("user_id").gte("created_at", since7).not("user_id", "is", null),
        supabase.from("usage_events").select("user_id").gte("created_at", since30).not("user_id", "is", null),
        supabase.from("usage_events").select("id", { count: "exact", head: true }).gte("created_at", since7),
        supabase.from("whatsapp_sessions").select("id", { count: "exact", head: true }),
        supabase.from("whatsapp_sessions").select("id", { count: "exact", head: true }).not("user_id", "is", null),
        supabase.from("messaging_preferences").select("id", { count: "exact", head: true }).eq("whatsapp_enabled", true),
        supabase.from("message_log").select("user_id").eq("channel", "whatsapp").gte("created_at", since7),
      ]);

      const wau = new Set((events7dData ?? []).map((e: any) => e.user_id)).size;
      const mau = new Set((events30dData ?? []).map((e: any) => e.user_id)).size;
      const waActiveUsers = new Set((waMsgs ?? []).map((m: any) => m.user_id).filter(Boolean)).size;

      setStats({
        totalProfiles: totalProfiles ?? 0,
        newProfiles7d: newProfiles7d ?? 0,
        wau,
        mau,
        events7d: events7dCount ?? 0,
        totalWaSessions: totalWa ?? 0,
        linkedWaSessions: linkedWa ?? 0,
        anonWaSessions: (totalWa ?? 0) - (linkedWa ?? 0),
        waEnabledUsers: waEnabled ?? 0,
        waActiveUsers7d: waActiveUsers,
        waMessages7d: waMsgs?.length ?? 0,
      });

      // Feature adoption - last 30d
      const { data: featData } = await supabase
        .from("usage_events")
        .select("event_name, user_id, created_at")
        .gte("created_at", since30)
        .order("created_at", { ascending: false })
        .limit(5000);

      const grouped = new Map<string, { users: Set<string>; total: number; last: string }>();
      for (const e of featData ?? []) {
        const ev = (e as any).event_name as string;
        if (!grouped.has(ev)) grouped.set(ev, { users: new Set(), total: 0, last: (e as any).created_at });
        const g = grouped.get(ev)!;
        g.total++;
        if ((e as any).user_id) g.users.add((e as any).user_id);
      }
      setFeatures(
        Array.from(grouped.entries())
          .map(([event_name, g]) => ({
            event_name,
            unique_users: g.users.size,
            total: g.total,
            last_seen: g.last,
          }))
          .sort((a, b) => b.total - a.total),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-green-900">Users & Channels</h2>
          <p className="text-sm text-muted-foreground">Web + WhatsApp engagement at a glance</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Web KPIs */}
      <div>
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2"><Users className="h-4 w-4" /> Web platform</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Kpi label="Total registered" value={stats.totalProfiles} />
          <Kpi label="New this week" value={stats.newProfiles7d} accent />
          <Kpi label="Weekly active (WAU)" value={stats.wau} />
          <Kpi label="Monthly active (MAU)" value={stats.mau} />
        </div>
      </div>

      {/* WhatsApp KPIs */}
      <div>
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2"><MessageCircle className="h-4 w-4" /> WhatsApp channel</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Kpi label="Total numbers" value={stats.totalWaSessions} />
          <Kpi label="Linked to account" value={stats.linkedWaSessions} accent />
          <Kpi label="Anonymous" value={stats.anonWaSessions} />
          <Kpi label="Opted-in (web)" value={stats.waEnabledUsers} />
          <Kpi label="WA active users (7d)" value={stats.waActiveUsers7d} />
          <Kpi label="WA messages (7d)" value={stats.waMessages7d} />
        </div>
      </div>

      {/* Feature adoption */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> Feature adoption (last 30 days)</CardTitle>
          <CardDescription>Captured via the in-app telemetry hook. {stats.events7d} events in the last 7 days.</CardDescription>
        </CardHeader>
        <CardContent>
          {features.length === 0 ? (
            <p className="text-sm text-muted-foreground">No telemetry events recorded yet. Once farmers use the platform, events will appear here.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead className="text-right">Unique users</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Last seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {features.map((f) => (
                  <TableRow key={f.event_name}>
                    <TableCell className="font-medium">
                      {f.event_name === "page_view" ? (
                        <Badge variant="secondary">page_view</Badge>
                      ) : (
                        <Badge className="bg-green-900">{f.event_name}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{f.unique_users}</TableCell>
                    <TableCell className="text-right">{f.total}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(f.last_seen).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const Kpi = ({ label, value, accent }: { label: string; value: number; accent?: boolean }) => (
  <Card>
    <CardContent className="pt-6">
      <div className={`text-3xl font-bold ${accent ? "text-green-900" : ""}`}>{value.toLocaleString()}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </CardContent>
  </Card>
);

export default UsersChannelsAdmin;
