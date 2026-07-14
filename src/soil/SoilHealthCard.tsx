import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sprout, Beaker, TrendingUp, Info, Upload, ClipboardList } from "lucide-react";
import SoilSelfAssessmentForm from "./SoilSelfAssessmentForm";
import SoilTestEntryForm from "./SoilTestEntryForm";

type Props = { farmId: string; farmName?: string };

type Card = {
  farm_id: string;
  region_code: string | null;
  region_name: string | null;
  health_grade: "A" | "B" | "C" | "D" | "E";
  soil_confidence: "low" | "medium" | "high" | "validated";
  latest_lab: any;
  latest_self_assessment: any;
  baseline: any;
};

const gradeColor: Record<string, string> = {
  A: "bg-emerald-600 text-white",
  B: "bg-green-500 text-white",
  C: "bg-yellow-500 text-white",
  D: "bg-orange-500 text-white",
  E: "bg-red-500 text-white",
};

const confidenceLabel: Record<string, { label: string; color: string; pct: number }> = {
  low:       { label: "Estimated",  color: "bg-orange-100 text-orange-800 border-orange-300", pct: 25 },
  medium:    { label: "Self-reported", color: "bg-yellow-100 text-yellow-800 border-yellow-300", pct: 55 },
  high:      { label: "Lab-tested", color: "bg-green-100 text-green-800 border-green-300", pct: 85 },
  validated: { label: "Validated", color: "bg-emerald-100 text-emerald-800 border-emerald-300", pct: 100 },
};

export default function SoilHealthCard({ farmId, farmName }: Props) {
  const [card, setCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAssessment, setShowAssessment] = useState(false);
  const [showLabEntry, setShowLabEntry] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("soil_health_cards" as any)
      .select("*")
      .eq("farm_id", farmId)
      .maybeSingle();
    setCard(data as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, [farmId]);

  // Trigger SoilGrids fetch in background if no baseline yet
  useEffect(() => {
    if (!loading && card && !card.baseline) {
      supabase.functions.invoke("soilgrids-fetch", { body: { farm_id: farmId } })
        .then(() => load())
        .catch(() => { /* silent — non-critical */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, card?.baseline]);

  if (loading) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading soil health card…</CardContent></Card>;
  if (!card) return null;

  const conf = confidenceLabel[card.soil_confidence];
  const lab = card.latest_lab;
  const sa = card.latest_self_assessment;
  const bl = card.baseline;

  // Determine displayed source per parameter
  const ph = lab?.ph_level ?? bl?.ph;
  const phSource = lab?.ph_level ? "Lab" : bl?.ph ? "Estimated" : "—";
  const om = lab?.organic_matter ?? (bl?.organic_carbon_g_per_kg ? (bl.organic_carbon_g_per_kg / 5.8).toFixed(1) : null);
  const omSource = lab?.organic_matter ? "Lab" : bl?.organic_carbon_g_per_kg ? "Estimated" : "—";
  const texture = lab?.clay_pct
    ? `${lab.sand_pct ?? "?"}/${lab.silt_pct ?? "?"}/${lab.clay_pct} S/Si/C`
    : sa?.texture_by_feel
    ? sa.texture_by_feel
    : bl?.clay_pct
    ? `~${Math.round(bl.sand_pct ?? 0)}/${Math.round(bl.silt_pct ?? 0)}/${Math.round(bl.clay_pct)} S/Si/C`
    : "—";

  return (
    <>
      <Card className="border-2 border-emerald-200">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-emerald-900">
                <Sprout className="w-5 h-5" />
                Soil Health Card
              </CardTitle>
              <CardDescription className="mt-1">
                {farmName ?? "This farm"} {card.region_name && <>· <span className="font-medium">{card.region_name}</span></>}
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-center">
                <div className={`w-14 h-14 rounded-lg flex items-center justify-center text-2xl font-bold ${gradeColor[card.health_grade]}`}>
                  {card.health_grade}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">Grade</div>
              </div>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Badge variant="outline" className={conf.color}>{conf.label}</Badge>
              <span className="text-xs text-muted-foreground">{conf.pct}% data confidence</span>
            </div>
            <Progress value={conf.pct} className="h-2" />
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Parameters grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Param label="pH" value={ph?.toFixed?.(1) ?? ph ?? "—"} source={phSource} />
            <Param label="Organic Matter %" value={om ?? "—"} source={omSource} />
            <Param label="Texture (S/Si/C)" value={texture} source={lab ? "Lab" : sa ? "Self" : bl ? "Estimated" : "—"} />
            <Param label="N (kg/ha)" value={lab?.nitrogen ?? "—"} source={lab?.nitrogen ? "Lab" : "—"} />
            <Param label="P (ppm)" value={lab?.phosphorus ?? "—"} source={lab?.phosphorus ? "Lab" : "—"} />
            <Param label="K (ppm)" value={lab?.potassium ?? "—"} source={lab?.potassium ? "Lab" : "—"} />
            <Param label="CEC" value={lab?.cec ?? bl?.cec_cmol_per_kg?.toFixed?.(1) ?? "—"} source={lab?.cec ? "Lab" : bl?.cec_cmol_per_kg ? "Estimated" : "—"} />
            <Param label="Drainage" value={sa?.drainage_class ?? "—"} source={sa?.drainage_class ? "Self" : "—"} />
            <Param label="Erosion" value={sa?.erosion_observed ?? "—"} source={sa?.erosion_observed ? "Self" : "—"} />
          </div>

          {/* Confidence-aware advice */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-900 flex gap-2">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              {card.soil_confidence === "low" && (
                <>This card is built from <strong>regional soil models</strong> for your zone. Add a 5-minute self-assessment to improve accuracy.</>
              )}
              {card.soil_confidence === "medium" && (
                <>You've added field observations. Upload a lab report when available for field-specific fertility recommendations.</>
              )}
              {card.soil_confidence === "high" && (
                <>Lab-tested data unlocked. Mudhumeni Hungwe can now give precise fertility and agroecology advice for this field.</>
              )}
              {card.soil_confidence === "validated" && (
                <>Your data has been cross-validated with multiple seasons of yield and NDVI feedback. Highest confidence tier.</>
              )}
            </div>
          </div>

          {/* Actions to enrich */}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowAssessment(true)}>
              <ClipboardList className="w-4 h-4 mr-1" /> Self-Assessment
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowLabEntry(true)}>
              <Beaker className="w-4 h-4 mr-1" /> Enter Lab Test
            </Button>
            <Button size="sm" variant="ghost" disabled className="opacity-60">
              <Upload className="w-4 h-4 mr-1" /> Upload Report (soon)
            </Button>
          </div>
        </CardContent>
      </Card>

      {showAssessment && (
        <SoilSelfAssessmentForm farmId={farmId} onClose={() => { setShowAssessment(false); load(); }} />
      )}
      {showLabEntry && (
        <SoilTestEntryForm farmId={farmId} onClose={() => { setShowLabEntry(false); load(); }} />
      )}
    </>
  );
}

function Param({ label, value, source }: { label: string; value: any; source: string }) {
  return (
    <div className="border rounded-md p-2 bg-white">
      <div className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className="text-base font-semibold text-emerald-900">{value}</div>
      <div className="text-[10px] text-muted-foreground">{source}</div>
    </div>
  );
}
