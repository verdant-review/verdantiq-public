import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

type Props = { farmId: string; onClose: () => void };

export default function SoilTestEntryForm({ farmId, onClose }: Props) {
  const { user } = useAuth();
  const [form, setForm] = useState<Record<string, string>>({
    test_date: new Date().toISOString().slice(0, 10),
    field_name: "",
    ph_level: "", organic_matter: "",
    nitrogen: "", phosphorus: "", potassium: "",
    cec: "", zinc: "", boron: "", sulphur: "",
    sand_pct: "", silt_pct: "", clay_pct: "",
    recommendations: "",
  });
  const [saving, setSaving] = useState(false);

  const num = (v: string) => (v === "" ? null : Number(v));

  const submit = async () => {
    if (!user) return;
    setSaving(true);
    const payload: any = {
      user_id: user.id,
      farm_id: farmId,
      test_date: form.test_date,
      field_name: form.field_name || null,
      ph_level: num(form.ph_level),
      organic_matter: num(form.organic_matter),
      nitrogen: num(form.nitrogen),
      phosphorus: num(form.phosphorus),
      potassium: num(form.potassium),
      cec: num(form.cec),
      zinc: num(form.zinc),
      boron: num(form.boron),
      sulphur: num(form.sulphur),
      sand_pct: num(form.sand_pct),
      silt_pct: num(form.silt_pct),
      clay_pct: num(form.clay_pct),
      recommendations: form.recommendations || null,
      confidence_level: "high",
      source: "lab_uploaded",
    };
    Object.keys(payload).forEach((k) => payload[k] === null && delete payload[k]);

    const { error } = await supabase.from("soil_tests").insert(payload);
    if (error) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
    } else {
      await supabase.from("farms").update({ soil_confidence: "high" }).eq("id", farmId);
      toast({ title: "Lab test saved", description: "Soil card confidence upgraded to High." });
      onClose();
    }
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enter Lab Soil Test</DialogTitle>
          <DialogDescription>From a printed soil report or extension officer entry.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <F label="Test date"><Input type="date" value={form.test_date} onChange={(e) => setForm({ ...form, test_date: e.target.value })} /></F>
          <F label="Field name"><Input value={form.field_name} onChange={(e) => setForm({ ...form, field_name: e.target.value })} /></F>
          <F label="pH"><Input value={form.ph_level} onChange={(e) => setForm({ ...form, ph_level: e.target.value })} /></F>
          <F label="Organic matter %"><Input value={form.organic_matter} onChange={(e) => setForm({ ...form, organic_matter: e.target.value })} /></F>
          <F label="N (kg/ha)"><Input value={form.nitrogen} onChange={(e) => setForm({ ...form, nitrogen: e.target.value })} /></F>
          <F label="P (ppm)"><Input value={form.phosphorus} onChange={(e) => setForm({ ...form, phosphorus: e.target.value })} /></F>
          <F label="K (ppm)"><Input value={form.potassium} onChange={(e) => setForm({ ...form, potassium: e.target.value })} /></F>
          <F label="CEC"><Input value={form.cec} onChange={(e) => setForm({ ...form, cec: e.target.value })} /></F>
          <F label="Zinc (ppm)"><Input value={form.zinc} onChange={(e) => setForm({ ...form, zinc: e.target.value })} /></F>
          <F label="Boron (ppm)"><Input value={form.boron} onChange={(e) => setForm({ ...form, boron: e.target.value })} /></F>
          <F label="Sulphur (ppm)"><Input value={form.sulphur} onChange={(e) => setForm({ ...form, sulphur: e.target.value })} /></F>
          <F label="Sand %"><Input value={form.sand_pct} onChange={(e) => setForm({ ...form, sand_pct: e.target.value })} /></F>
          <F label="Silt %"><Input value={form.silt_pct} onChange={(e) => setForm({ ...form, silt_pct: e.target.value })} /></F>
          <F label="Clay %"><Input value={form.clay_pct} onChange={(e) => setForm({ ...form, clay_pct: e.target.value })} /></F>
        </div>
        <div className="mt-3">
          <Label className="text-sm">Recommendations from lab (if any)</Label>
          <Textarea value={form.recommendations} onChange={(e) => setForm({ ...form, recommendations: e.target.value })} rows={2} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save Lab Test"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
