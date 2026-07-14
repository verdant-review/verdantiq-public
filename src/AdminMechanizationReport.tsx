import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Gauge } from "lucide-react";

const AdminMechanizationReport = () => {
  const [byCategory, setByCategory] = useState<{ category: string; count: number }[]>([]);
  const [byPower, setByPower] = useState<{ power: string; count: number }[]>([]);
  const [byProvince, setByProvince] = useState<{ region: string; avgScore: number; farms: number }[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data: equipment } = await (supabase as any)
        .from("equipment").select("category, power_source, farm_id, is_operational");
      const cat = new Map<string, number>();
      const pw = new Map<string, number>();
      (equipment || []).forEach((e: any) => {
        const c = e.category || "uncategorized";
        const p = e.power_source || "unknown";
        cat.set(c, (cat.get(c) || 0) + 1);
        pw.set(p, (pw.get(p) || 0) + 1);
      });
      setByCategory(Array.from(cat.entries()).map(([category, count]) => ({ category, count })));
      setByPower(Array.from(pw.entries()).map(([power, count]) => ({ power, count })));

      // Per-province average score: fetch farms then call RPC for each
      const { data: farms } = await (supabase as any).from("farms").select("id, location");
      const provinceMap = new Map<string, { sum: number; n: number }>();
      for (const f of (farms || [])) {
        const { data: sc } = await (supabase as any).rpc("get_farm_mechanization_score", { _farm_id: f.id });
        if (sc) {
          const region = f.location || "Unknown";
          const cur = provinceMap.get(region) || { sum: 0, n: 0 };
          cur.sum += Number(sc.score || 0); cur.n += 1;
          provinceMap.set(region, cur);
        }
      }
      setByProvince(Array.from(provinceMap.entries())
        .map(([region, v]) => ({ region, avgScore: Math.round(v.sum / v.n), farms: v.n }))
        .sort((a, b) => b.avgScore - a.avgScore));
    };
    load();
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center"><Gauge className="h-5 w-5 mr-2" /> Mechanization by Province</CardTitle>
          <CardDescription>Average score (0–100) across registered farms — ministry-facing report</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Province</TableHead><TableHead>Farms</TableHead><TableHead>Avg score</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {byProvince.map((r) => (
                <TableRow key={r.region}>
                  <TableCell>{r.region}</TableCell>
                  <TableCell>{r.farms}</TableCell>
                  <TableCell className="font-semibold">{r.avgScore}</TableCell>
                </TableRow>
              ))}
              {byProvince.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No data</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Equipment by Category</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Category</TableHead><TableHead>Count</TableHead></TableRow></TableHeader>
              <TableBody>
                {byCategory.map((r) => <TableRow key={r.category}><TableCell className="capitalize">{r.category}</TableCell><TableCell>{r.count}</TableCell></TableRow>)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Power Source Mix</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Power source</TableHead><TableHead>Count</TableHead></TableRow></TableHeader>
              <TableBody>
                {byPower.map((r) => <TableRow key={r.power}><TableCell className="capitalize">{r.power}</TableCell><TableCell>{r.count}</TableCell></TableRow>)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminMechanizationReport;
