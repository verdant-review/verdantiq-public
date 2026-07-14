import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Leaf, Plus, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Props = { farmId: string };

type Practice = {
  id?: string;
  farm_id: string;
  season: string;
  cover_crops: string[];
  rotation_sequence: string[];
  intercrops: any[];
  agroforestry_species: string[];
  conservation_ag_methods: string[];
  organic_inputs: any[];
  adoption_score?: number;
};

const currentSeason = () => {
  const now = new Date();
  const y = now.getFullYear();
  // Zimbabwe summer cropping season ~Oct-May
  return now.getMonth() >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
};

const COVER_CROP_OPTS = ["Mucuna", "Lablab", "Sunnhemp", "Cowpea", "Pigeonpea", "Velvet bean", "Crotalaria"];
const CA_OPTS = ["No-till / minimum tillage", "Permanent mulch cover", "Crop rotation", "Contour ridges", "Vetiver strips"];
const AGROFORESTRY_OPTS = ["Faidherbia albida", "Gliricidia", "Leucaena", "Moringa", "Acacia", "Grevillea", "Calliandra"];

export default function PracticeTracker({ farmId }: Props) {
  const [practice, setPractice] = useState<Practice | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newRotation, setNewRotation] = useState("");

  const season = currentSeason();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("farm_practices")
        .select("*")
        .eq("farm_id", farmId)
        .eq("season", season)
        .maybeSingle();
      setPractice(
        (data as Practice) ?? {
          farm_id: farmId, season,
          cover_crops: [], rotation_sequence: [], intercrops: [],
          agroforestry_species: [], conservation_ag_methods: [], organic_inputs: [],
        }
      );
      setLoading(false);
    })();
  }, [farmId, season]);

  const toggle = (field: "cover_crops" | "agroforestry_species" | "conservation_ag_methods", val: string) => {
    if (!practice) return;
    const arr = practice[field] || [];
    setPractice({
      ...practice,
      [field]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val],
    });
  };

  const save = async () => {
    if (!practice) return;
    setSaving(true);
    const { id, adoption_score, ...payload } = practice;
    const { error } = id
      ? await supabase.from("farm_practices").update(payload).eq("id", id)
      : await supabase.from("farm_practices").insert(payload);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Practices saved" });
      const { data } = await supabase.from("farm_practices").select("*").eq("farm_id", farmId).eq("season", season).maybeSingle();
      setPractice(data as Practice);
    }
    setSaving(false);
  };

  if (loading || !practice) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent></Card>;

  const score = practice.adoption_score ?? 0;
  const scoreBand = score >= 80 ? { label: "Champion", color: "bg-emerald-600" }
                  : score >= 50 ? { label: "Adopter", color: "bg-green-500" }
                  : score >= 25 ? { label: "Beginner", color: "bg-yellow-500" }
                  : { label: "Conventional", color: "bg-orange-500" };

  return (
    <Card className="border-2 border-green-200">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-green-900"><Leaf className="w-5 h-5" /> Agroecology Practices</CardTitle>
            <CardDescription>Season {season}</CardDescription>
          </div>
          <div className="text-center">
            <Badge className={`${scoreBand.color} text-white`}>{scoreBand.label}</Badge>
            <div className="text-2xl font-bold text-green-900 mt-1">{score}/100</div>
            <Progress value={score} className="h-2 w-24 mt-1" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Section title="Cover crops used this season">
          <ChipGroup options={COVER_CROP_OPTS} selected={practice.cover_crops} onToggle={(v) => toggle("cover_crops", v)} />
        </Section>

        <Section title="Crop rotation (last 3 seasons, oldest → newest)">
          <div className="flex gap-2 flex-wrap">
            {practice.rotation_sequence.map((c, i) => (
              <Badge key={i} variant="secondary" className="gap-1">
                {c}
                <button onClick={() => setPractice({ ...practice, rotation_sequence: practice.rotation_sequence.filter((_, j) => j !== i) })}>
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <Input placeholder="e.g. maize" value={newRotation} onChange={(e) => setNewRotation(e.target.value)} className="max-w-xs" />
            <Button size="sm" variant="outline" onClick={() => {
              if (newRotation.trim()) {
                setPractice({ ...practice, rotation_sequence: [...practice.rotation_sequence, newRotation.trim()] });
                setNewRotation("");
              }
            }}><Plus className="w-3 h-3 mr-1" /> Add</Button>
          </div>
        </Section>

        <Section title="Conservation agriculture methods">
          <ChipGroup options={CA_OPTS} selected={practice.conservation_ag_methods} onToggle={(v) => toggle("conservation_ag_methods", v)} />
        </Section>

        <Section title="Agroforestry species on farm">
          <ChipGroup options={AGROFORESTRY_OPTS} selected={practice.agroforestry_species} onToggle={(v) => toggle("agroforestry_species", v)} />
        </Section>

        <div className="flex justify-end pt-2">
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Practices"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-sm font-medium text-green-900">{title}</Label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function ChipGroup({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            className={`text-xs px-3 py-1.5 rounded-full border transition ${
              on ? "bg-green-600 text-white border-green-600" : "bg-white text-green-900 border-green-300 hover:bg-green-50"
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
