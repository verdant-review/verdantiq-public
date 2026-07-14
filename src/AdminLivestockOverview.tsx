import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Beef } from "lucide-react";

const AdminLivestockOverview = () => {
  const [bySpecies, setBySpecies] = useState<{ species: string; herds: number; total: number }[]>([]);
  const [byProvince, setByProvince] = useState<{ region: string; herds: number; total: number }[]>([]);
  const [recentDeaths, setRecentDeaths] = useState<number>(0);
  const [recentSales, setRecentSales] = useState<number>(0);

  useEffect(() => {
    const load = async () => {
      const { data: herds } = await (supabase as any)
        .from("livestock_herds")
        .select("species, herd_size, farm_id");
      const { data: farms } = await (supabase as any)
        .from("farms").select("id, location");
      const farmMap = new Map((farms || []).map((f: any) => [f.id, f.location || "Unknown"]));

      const sp = new Map<string, { herds: number; total: number }>();
      const pr = new Map<string, { herds: number; total: number }>();
      (herds || []).forEach((h: any) => {
        const s = sp.get(h.species) || { herds: 0, total: 0 };
        s.herds += 1; s.total += h.herd_size || 0;
        sp.set(h.species, s);

        const region = String(farmMap.get(h.farm_id) || "Unknown");
        const p = pr.get(region) || { herds: 0, total: 0 };
        p.herds += 1; p.total += h.herd_size || 0;
        pr.set(region, p);
      });

      setBySpecies(Array.from(sp.entries()).map(([species, v]) => ({ species, ...v })));
      setByProvince(Array.from(pr.entries()).map(([region, v]) => ({ region, ...v })));

      const since = new Date(); since.setDate(since.getDate() - 30);
      const { data: events } = await (supabase as any)
        .from("livestock_events")
        .select("event_type")
        .gte("event_date", since.toISOString().slice(0, 10));
      setRecentDeaths((events || []).filter((e: any) => e.event_type === "death").length);
      setRecentSales((events || []).filter((e: any) => e.event_type === "sale").length);
    };
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Total Herds</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{bySpecies.reduce((a, b) => a + b.herds, 0)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Deaths (30d)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-red-600">{recentDeaths}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Sales (30d)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{recentSales}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center"><Beef className="h-5 w-5 mr-2" /> Livestock by Species</CardTitle>
          <CardDescription>Total animals across all registered farms</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Species</TableHead><TableHead>Herds</TableHead><TableHead>Total animals</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {bySpecies.map((r) => (
                <TableRow key={r.species}><TableCell>{r.species}</TableCell><TableCell>{r.herds}</TableCell><TableCell>{r.total}</TableCell></TableRow>
              ))}
              {bySpecies.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No livestock recorded yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Livestock by Province</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Province</TableHead><TableHead>Herds</TableHead><TableHead>Total animals</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {byProvince.map((r) => (
                <TableRow key={r.region}><TableCell>{r.region}</TableCell><TableCell>{r.herds}</TableCell><TableCell>{r.total}</TableCell></TableRow>
              ))}
              {byProvince.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No data</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLivestockOverview;
