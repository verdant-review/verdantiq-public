import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Download, Inbox } from "lucide-react";
import { toast } from "sonner";

type Audience = "agribusiness" | "ngo";

interface DiscoveryRow {
  id: string;
  created_at: string;
  audience: Audience;
  name: string;
  company: string;
  role: string;
  email: string;
  // agri
  relationship_type: string | null;
  farmer_count_band: string | null;
  current_monitoring: string | null;
  pain_ranking: string[] | null;
  would_pay: "yes" | "depends" | "no" | null;
  would_pay_notes: string | null;
  one_fix: string | null;
  // ngo
  ngo_program_type: string | null;
  ngo_funder_type: string | null;
  ngo_beneficiary_band: string | null;
  ngo_me_tools: string | null;
  ngo_pain_ranking: string[] | null;
  ngo_reporting_burden: string | null;
  ngo_budget_band: string | null;
  ngo_must_have: string | null;
  // shared
  follow_up_ok: boolean;
  follow_up_contact: string | null;
  source: string | null;
  user_agent: string | null;
}

const AGRI_PAIN_LABELS: Record<string, string> = {
  side_selling: "Side-selling",
  low_yields: "Low yields",
  late_deliveries: "Late deliveries",
  input_misuse: "Input misuse",
  no_visibility: "No visibility",
};
const NGO_PAIN_LABELS: Record<string, string> = {
  beneficiary_dedup: "Beneficiary dedup",
  donor_reporting: "Donor reporting",
  outcome_evidence: "Outcome evidence",
  field_data_quality: "Field data quality",
  geo_verification: "Geo verification",
};
const REL_LABELS: Record<string, string> = {
  seed_house: "Seed house",
  contract_buyer: "Contract buyer",
  processor: "Processor",
  input_supplier: "Input supplier",
  ngo: "NGO",
  other: "Other",
};
const BAND_LABELS: Record<string, string> = {
  lt_100: "<100", "100_500": "100–500", "500_2000": "500–2k", "2000_plus": "2k+",
};
const NGO_BAND_LABELS: Record<string, string> = {
  lt_500: "<500", "500_5k": "500–5k", "5k_25k": "5k–25k", "25k_plus": "25k+",
};
const MON_LABELS: Record<string, string> = {
  field_officers: "Field officers", spreadsheets: "Spreadsheets",
  whatsapp: "WhatsApp", software: "Software", none: "None",
};
const NGO_PROG_LABELS: Record<string, string> = {
  climate_resilience: "Climate resilience", food_security: "Food security",
  livelihoods: "Livelihoods", value_chain: "Value chain",
  input_distribution: "Input distribution", other: "Other",
};
const NGO_FUNDER_LABELS: Record<string, string> = {
  bilateral: "Bilateral", multilateral: "Multilateral",
  foundation: "Foundation", private: "Private", mixed: "Mixed",
};
const NGO_ME_LABELS: Record<string, string> = {
  kobo_ona: "Kobo/ONA", commcare: "CommCare", excel: "Excel + paper",
  custom: "Custom DB", none: "None",
};
const NGO_BURDEN_LABELS: Record<string, string> = {
  low: "Manageable", medium: "Real cost", high: "Crippling",
};
const NGO_BUDGET_LABELS: Record<string, string> = {
  lt_5: "<$5/ben/yr", "5_15": "$5–15/ben/yr", "15_50": "$15–50/ben/yr",
  depends_donor: "Depends on donor", no_budget: "No budget",
};

const csvEscape = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join("|") : String(v);
  return `"${s.replace(/"/g, '""')}"`;
};

const DiscoveryAdmin = () => {
  const [rows, setRows] = useState<DiscoveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DiscoveryRow | null>(null);
  const [tab, setTab] = useState<Audience>("agribusiness");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("discovery_responses")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) toast.error(error.message);
      else setRows((data ?? []) as unknown as DiscoveryRow[]);
      setLoading(false);
    })();
  }, []);

  const segmented = useMemo(() => ({
    agribusiness: rows.filter(r => (r.audience ?? "agribusiness") === "agribusiness"),
    ngo: rows.filter(r => r.audience === "ngo"),
  }), [rows]);

  const computeStats = (list: DiscoveryRow[], audience: Audience) => {
    const total = list.length;
    const followUp = list.filter(r => r.follow_up_ok).length;
    if (audience === "agribusiness") {
      const yes = list.filter(r => r.would_pay === "yes").length;
      const depends = list.filter(r => r.would_pay === "depends").length;
      const painScores: Record<string, number> = {};
      list.forEach(r => {
        (r.pain_ranking ?? []).forEach((id, idx) => {
          painScores[id] = (painScores[id] ?? 0) + (5 - idx);
        });
      });
      const top = Object.entries(painScores).sort((a, b) => b[1] - a[1])[0]?.[0];
      return {
        total, followUp,
        primary: { label: "Would pay: Yes", value: total ? `${Math.round((yes / total) * 100)}%` : "—" },
        secondary: { label: "Depends", value: total ? `${Math.round((depends / total) * 100)}%` : "—" },
        topPain: top ? AGRI_PAIN_LABELS[top] ?? top : "—",
      };
    }
    const painScores: Record<string, number> = {};
    list.forEach(r => {
      (r.ngo_pain_ranking ?? []).forEach((id, idx) => {
        painScores[id] = (painScores[id] ?? 0) + (5 - idx);
      });
    });
    const top = Object.entries(painScores).sort((a, b) => b[1] - a[1])[0]?.[0];
    const burdenHigh = list.filter(r => r.ngo_reporting_burden === "high").length;
    const hasBudget = list.filter(r => r.ngo_budget_band && r.ngo_budget_band !== "no_budget").length;
    return {
      total, followUp,
      primary: { label: "Has M&E budget", value: total ? `${Math.round((hasBudget / total) * 100)}%` : "—" },
      secondary: { label: "Reporting = crippling", value: total ? `${Math.round((burdenHigh / total) * 100)}%` : "—" },
      topPain: top ? NGO_PAIN_LABELS[top] ?? top : "—",
    };
  };

  const exportCsv = (list: DiscoveryRow[], audience: Audience) => {
    const headers = audience === "agribusiness"
      ? ["created_at", "name", "company", "role", "email", "relationship_type", "farmer_count_band", "current_monitoring", "pain_ranking", "would_pay", "would_pay_notes", "one_fix", "follow_up_ok", "follow_up_contact", "source"]
      : ["created_at", "name", "company", "role", "email", "ngo_program_type", "ngo_funder_type", "ngo_beneficiary_band", "ngo_me_tools", "ngo_pain_ranking", "ngo_reporting_burden", "ngo_budget_band", "ngo_must_have", "follow_up_ok", "follow_up_contact", "source"];
    const lines = [headers.join(",")];
    list.forEach(r => {
      lines.push(headers.map(h => csvEscape((r as unknown as Record<string, unknown>)[h])).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `discovery-${audience}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const renderSegment = (list: DiscoveryRow[], audience: Audience) => {
    const stats = computeStats(list, audience);
    const isAgri = audience === "agribusiness";
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Total responses</div><div className="text-2xl font-bold">{stats.total}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">{stats.primary.label}</div><div className="text-2xl font-bold text-green-700">{stats.primary.value}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">{stats.secondary.label}</div><div className="text-2xl font-bold text-yellow-700">{stats.secondary.value}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Want follow-up call</div><div className="text-2xl font-bold">{stats.followUp}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Top pain point</div><div className="text-lg font-semibold">{stats.topPain}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{isAgri ? "Agribusiness responses" : "NGO responses"}</CardTitle>
            <div className="flex gap-2 items-center">
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Share: <code className="bg-muted px-1 rounded">/discovery{isAgri ? "" : "?audience=ngo"}</code>
              </span>
              <Button variant="outline" size="sm" onClick={() => exportCsv(list, audience)} disabled={!list.length}>
                <Download className="h-4 w-4 mr-1" /> CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {list.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Inbox className="h-10 w-10 mx-auto mb-2 opacity-50" />
                No responses yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>{isAgri ? "Company" : "Organisation"}</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>{isAgri ? "Farmers" : "Beneficiaries"}</TableHead>
                      <TableHead>{isAgri ? "Would pay" : "Budget"}</TableHead>
                      <TableHead>Follow-up</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map(r => (
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                        <TableCell className="text-xs">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <div className="font-medium">{r.name}</div>
                          <div className="text-xs text-muted-foreground">{r.role}</div>
                        </TableCell>
                        <TableCell>{r.company}</TableCell>
                        <TableCell className="text-xs">
                          {isAgri
                            ? (REL_LABELS[r.relationship_type ?? ""] ?? r.relationship_type ?? "—")
                            : (NGO_PROG_LABELS[r.ngo_program_type ?? ""] ?? r.ngo_program_type ?? "—")}
                        </TableCell>
                        <TableCell className="text-xs">
                          {isAgri
                            ? (BAND_LABELS[r.farmer_count_band ?? ""] ?? "—")
                            : (NGO_BAND_LABELS[r.ngo_beneficiary_band ?? ""] ?? "—")}
                        </TableCell>
                        <TableCell>
                          {isAgri ? (
                            r.would_pay ? (
                              <Badge variant={r.would_pay === "yes" ? "default" : r.would_pay === "depends" ? "secondary" : "outline"}>
                                {r.would_pay}
                              </Badge>
                            ) : "—"
                          ) : (
                            <span className="text-xs">{NGO_BUDGET_LABELS[r.ngo_budget_band ?? ""] ?? "—"}</span>
                          )}
                        </TableCell>
                        <TableCell>{r.follow_up_ok ? "✓" : ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Audience)}>
      <TabsList>
        <TabsTrigger value="agribusiness">Agribusiness ({segmented.agribusiness.length})</TabsTrigger>
        <TabsTrigger value="ngo">NGOs ({segmented.ngo.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="agribusiness" className="mt-4">
        {renderSegment(segmented.agribusiness, "agribusiness")}
      </TabsContent>
      <TabsContent value="ngo" className="mt-4">
        {renderSegment(segmented.ngo, "ngo")}
      </TabsContent>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.name} — {selected?.company}</DialogTitle>
          </DialogHeader>
          {selected && (selected.audience === "ngo" ? (
            <div className="space-y-4 text-sm">
              <Badge variant="secondary">NGO</Badge>
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Role:</span> {selected.role}</div>
                <div><span className="text-muted-foreground">Email:</span> {selected.email}</div>
                <div><span className="text-muted-foreground">Programme:</span> {NGO_PROG_LABELS[selected.ngo_program_type ?? ""] ?? "—"}</div>
                <div><span className="text-muted-foreground">Funder:</span> {NGO_FUNDER_LABELS[selected.ngo_funder_type ?? ""] ?? "—"}</div>
                <div><span className="text-muted-foreground">Beneficiaries:</span> {NGO_BAND_LABELS[selected.ngo_beneficiary_band ?? ""] ?? "—"}</div>
                <div><span className="text-muted-foreground">M&amp;E tools:</span> {NGO_ME_LABELS[selected.ngo_me_tools ?? ""] ?? "—"}</div>
                <div><span className="text-muted-foreground">Reporting burden:</span> {NGO_BURDEN_LABELS[selected.ngo_reporting_burden ?? ""] ?? "—"}</div>
                <div><span className="text-muted-foreground">Budget:</span> {NGO_BUDGET_LABELS[selected.ngo_budget_band ?? ""] ?? "—"}</div>
                <div><span className="text-muted-foreground">Source:</span> {selected.source ?? "direct"}</div>
              </div>
              <div>
                <div className="font-semibold mb-1">Pain ranking (most → least)</div>
                <ol className="list-decimal list-inside space-y-0.5">
                  {(selected.ngo_pain_ranking ?? []).map(id => (
                    <li key={id}>{NGO_PAIN_LABELS[id] ?? id}</li>
                  ))}
                </ol>
              </div>
              <div>
                <div className="font-semibold mb-1">Must-have feature for next proposal</div>
                <p className="bg-muted p-3 rounded">"{selected.ngo_must_have}"</p>
              </div>
              {selected.follow_up_ok && (
                <div className="border-t pt-3">
                  <div className="font-semibold text-green-700">✓ Open to follow-up call</div>
                  {selected.follow_up_contact && (
                    <div className="text-sm mt-1">Contact: {selected.follow_up_contact}</div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <Badge>Agribusiness</Badge>
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Role:</span> {selected.role}</div>
                <div><span className="text-muted-foreground">Email:</span> {selected.email}</div>
                <div><span className="text-muted-foreground">Type:</span> {REL_LABELS[selected.relationship_type ?? ""] ?? "—"}</div>
                <div><span className="text-muted-foreground">Farmers:</span> {BAND_LABELS[selected.farmer_count_band ?? ""] ?? "—"}</div>
                <div><span className="text-muted-foreground">Monitoring today:</span> {MON_LABELS[selected.current_monitoring ?? ""] ?? "—"}</div>
                <div><span className="text-muted-foreground">Source:</span> {selected.source ?? "direct"}</div>
              </div>
              <div>
                <div className="font-semibold mb-1">Pain ranking (most → least)</div>
                <ol className="list-decimal list-inside space-y-0.5">
                  {(selected.pain_ranking ?? []).map(id => (
                    <li key={id}>{AGRI_PAIN_LABELS[id] ?? id}</li>
                  ))}
                </ol>
              </div>
              <div>
                <div className="font-semibold mb-1">Would pay $5/farmer/season?</div>
                {selected.would_pay && (
                  <Badge variant={selected.would_pay === "yes" ? "default" : selected.would_pay === "depends" ? "secondary" : "outline"}>
                    {selected.would_pay}
                  </Badge>
                )}
                {selected.would_pay_notes && (
                  <p className="mt-2 text-muted-foreground italic">"{selected.would_pay_notes}"</p>
                )}
              </div>
              <div>
                <div className="font-semibold mb-1">One thing they'd fix</div>
                <p className="bg-muted p-3 rounded">"{selected.one_fix}"</p>
              </div>
              {selected.follow_up_ok && (
                <div className="border-t pt-3">
                  <div className="font-semibold text-green-700">✓ Open to follow-up call</div>
                  {selected.follow_up_contact && (
                    <div className="text-sm mt-1">Contact: {selected.follow_up_contact}</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </DialogContent>
      </Dialog>
    </Tabs>
  );
};

export default DiscoveryAdmin;
