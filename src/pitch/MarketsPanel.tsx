import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Button } from "@/components/ui/button";

const COLORS = ["#fbbf24", "#34d399", "#60a5fa", "#f472b6", "#a78bfa", "#fb923c"];

export default function MarketsPanel() {
  const [currency, setCurrency] = useState<"USD" | "ZIG">("USD");
  const [data, setData] = useState<any[]>([]);
  const [crops, setCrops] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      if (currency === "USD") {
        const { data: rows } = await supabase
          .from("market_price_history")
          .select("crop, price, recorded_date")
          .eq("currency", "USD")
          .gte("recorded_date", new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10))
          .order("recorded_date", { ascending: true })
          .limit(2000);
        buildSeries(rows || [], "crop", "price", "recorded_date");
      } else {
        const { data: rows } = await supabase
          .from("mbare_price_history")
          .select("item, zig_price, recorded_date")
          .gte("recorded_date", new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10))
          .order("recorded_date", { ascending: true })
          .limit(2000);
        buildSeries(rows || [], "item", "zig_price", "recorded_date");
      }
    })();

    function buildSeries(rows: any[], cropKey: string, priceKey: string, dateKey: string) {
      const cropTotals: Record<string, number> = {};
      rows.forEach((r) => { cropTotals[r[cropKey]] = (cropTotals[r[cropKey]] || 0) + 1; });
      const top = Object.entries(cropTotals).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c);
      setCrops(top);
      const byDay: Record<string, any> = {};
      rows.forEach((r) => {
        const d = r[dateKey];
        if (!byDay[d]) byDay[d] = { day: d };
        if (top.includes(r[cropKey])) {
          // average if multiple rows per day
          const k = r[cropKey];
          if (byDay[d][k] == null) { byDay[d][k] = Number(r[priceKey]); byDay[d][`${k}__n`] = 1; }
          else { byDay[d][k] += Number(r[priceKey]); byDay[d][`${k}__n`]++; }
        }
      });
      const arr = Object.values(byDay).map((row: any) => {
        top.forEach((c) => { if (row[`${c}__n`]) row[c] = +(row[c] / row[`${c}__n`]).toFixed(2); });
        return row;
      }).sort((a: any, b: any) => a.day.localeCompare(b.day));
      setData(arr);
    }
  }, [currency]);

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {(["USD", "ZIG"] as const).map((c) => (
          <Button key={c} size="sm" variant={currency === c ? "default" : "outline"} onClick={() => setCurrency(c)}>
            {c}
          </Button>
        ))}
      </div>
      {data.length === 0 ? (
        <div className="text-sm text-emerald-300">No market data for the selected currency.</div>
      ) : (
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#065f46" />
              <XAxis dataKey="day" stroke="#a7f3d0" fontSize={10} tickFormatter={(d) => d.slice(5)} />
              <YAxis stroke="#a7f3d0" fontSize={10} />
              <Tooltip contentStyle={{ background: "#064e3b", border: "1px solid #047857", color: "white", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 10, color: "white" }} />
              {crops.map((c, i) => (
                <Line key={c} type="monotone" dataKey={c} stroke={COLORS[i % COLORS.length]} strokeWidth={1.5} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
