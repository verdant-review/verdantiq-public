import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface FeedbackRow {
  id: string;
  user_id: string | null;
  feedback_type: string;
  rating: number | null;
  message: string;
  page_route: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
}

interface UsageRow {
  event_name: string;
  count: number;
}

const STATUS_OPTIONS = ["new", "triaged", "resolved", "wontfix"];

const FeedbackAdmin = () => {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: fb }, { data: ev }] = await Promise.all([
      supabase
        .from("platform_feedback")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("usage_events")
        .select("event_name")
        .gte("created_at", since30)
        .limit(10000),
    ]);

    setRows((fb as FeedbackRow[]) || []);
    const counts: Record<string, number> = {};
    for (const e of (ev as { event_name: string }[]) || []) {
      counts[e.event_name] = (counts[e.event_name] || 0) + 1;
    }
    setUsage(
      Object.entries(counts)
        .map(([event_name, count]) => ({ event_name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12),
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (filterType === "all" || r.feedback_type === filterType) &&
          (filterStatus === "all" || r.status === filterStatus),
      ),
    [rows, filterType, filterStatus],
  );

  const stats = useMemo(() => {
    const now = Date.now();
    const last7 = rows.filter((r) => now - new Date(r.created_at).getTime() < 7 * 86400_000);
    const last30 = rows.filter((r) => now - new Date(r.created_at).getTime() < 30 * 86400_000);
    const ratings = rows.map((r) => r.rating).filter((r): r is number => r != null);
    const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    const bugs = last30.filter((r) => r.feedback_type === "bug").length;
    const ideas = last30.filter((r) => r.feedback_type === "idea").length;
    return { last7: last7.length, last30: last30.length, avg, bugs, ideas };
  }, [rows]);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("platform_feedback").update({ status }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    toast.success("Updated");
  };

  const exportCsv = () => {
    const header = ["created_at", "type", "rating", "status", "page_route", "message"].join(",");
    const lines = filtered.map((r) =>
      [
        r.created_at,
        r.feedback_type,
        r.rating ?? "",
        r.status,
        r.page_route ?? "",
        `"${(r.message || "").replace(/"/g, '""')}"`,
      ].join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `feedback-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Last 7 days" value={stats.last7} />
        <Stat label="Last 30 days" value={stats.last30} />
        <Stat label="Avg rating" value={stats.avg ? stats.avg.toFixed(2) : "—"} />
        <Stat label="Bugs (30d)" value={stats.bugs} />
        <Stat label="Ideas (30d)" value={stats.ideas} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Top events (30d)</CardTitle>
          <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent>
          {usage.length === 0 ? (
            <p className="text-sm text-muted-foreground">No telemetry yet.</p>
          ) : (
            <ul className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {usage.map((u) => (
                <li key={u.event_name} className="flex justify-between text-sm border rounded px-3 py-2">
                  <span className="truncate">{u.event_name}</span>
                  <span className="font-mono text-muted-foreground">{u.count}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base">Feedback</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="bug">Bugs</SelectItem>
                <SelectItem value="idea">Ideas</SelectItem>
                <SelectItem value="praise">Praise</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Page</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell><Badge variant="outline">{r.feedback_type}</Badge></TableCell>
                      <TableCell>{r.rating ?? "—"}</TableCell>
                      <TableCell className="text-xs font-mono">{r.page_route ?? "—"}</TableCell>
                      <TableCell className="max-w-md text-sm">{r.message}</TableCell>
                      <TableCell>
                        <Select value={r.status} onValueChange={(v) => updateStatus(r.id, v)}>
                          <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No feedback yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <Card>
    <CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </CardContent>
  </Card>
);

export default FeedbackAdmin;
