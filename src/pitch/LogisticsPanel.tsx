import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";

const STATUS_ORDER = ["Pending", "Scheduled", "In Transit", "Collected", "GRN Issued"];

export default function LogisticsPanel() {
  const [stats, setStats] = useState<{ status: string; count: number; pct: number }[]>([]);
  const [grns, setGrns] = useState(0);

  useEffect(() => {
    (async () => {
      const [{ data: requests }, { count }] = await Promise.all([
        supabase.from("collection_requests").select("status"),
        supabase.from("goods_received_notes").select("id", { count: "exact", head: true }),
      ]);
      const counts: Record<string, number> = {};
      (requests || []).forEach((r: any) => { counts[r.status] = (counts[r.status] || 0) + 1; });
      const total = Math.max(1, (requests || []).length);
      const out = STATUS_ORDER.map((s) => ({
        status: s,
        count: counts[s] || 0,
        pct: Math.round(((counts[s] || 0) / total) * 100),
      }));
      // include any extra statuses
      Object.keys(counts).filter((s) => !STATUS_ORDER.includes(s)).forEach((s) => {
        out.push({ status: s, count: counts[s], pct: Math.round((counts[s] / total) * 100) });
      });
      setStats(out);
      setGrns(count || 0);
    })();
  }, []);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {stats.map((s) => (
          <div key={s.status}>
            <div className="flex justify-between text-sm"><span>{s.status}</span><span>{s.count}</span></div>
            <Progress value={s.pct} className="h-2 bg-emerald-950" />
          </div>
        ))}
      </div>
      <div className="text-xs text-emerald-200 pt-2 border-t border-emerald-700">
        Goods Received Notes issued: <span className="font-bold text-white">{grns}</span>
      </div>
    </div>
  );
}
