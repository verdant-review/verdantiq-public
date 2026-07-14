import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

type Props = { farmId: string; onClose: () => void };

export default function SoilSelfAssessmentForm({ farmId, onClose }: Props) {
  const [form, setForm] = useState({
    field_name: "",
    soil_colour: "",
    texture_by_feel: "",
    slope_class: "",
    drainage_class: "",
    erosion_observed: "",
    residue_management: "",
    last_manure_application_date: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    setSaving(true);
    const payload: any = { farm_id: farmId, ...form };
    if (!payload.last_manure_application_date) delete payload.last_manure_application_date;
    Object.keys(payload).forEach((k) => payload[k] === "" && delete payload[k]);

    const { error } = await supabase.from("soil_self_assessments").insert(payload);
    if (error) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
    } else {
      // bump farm soil_confidence to medium (only if currently low)
      await supabase.from("farms").update({ soil_confidence: "medium" }).eq("id", farmId).eq("soil_confidence", "low");
      toast({ title: "Saved", description: "Soil card confidence upgraded to Medium." });
      onClose();
    }
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>5-Minute Soil Self-Assessment</DialogTitle>
          <DialogDescription>
            Quick field observations. No lab needed. Upgrades your soil card from Estimated → Self-Reported.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Field name (optional)">
            <Input value={form.field_name} onChange={(e) => set("field_name")(e.target.value)} placeholder="e.g. North field" />
          </Field>

          <Field label="Soil colour">
            <Select value={form.soil_colour} onValueChange={set("soil_colour")}>
              <SelectTrigger><SelectValue placeholder="Pick the dominant colour" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="red">Red / reddish</SelectItem>
                <SelectItem value="brown">Brown</SelectItem>
                <SelectItem value="black">Black / very dark</SelectItem>
                <SelectItem value="grey">Grey</SelectItem>
                <SelectItem value="yellow">Yellow / pale</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Texture by feel (rub moist soil between fingers)">
            <Select value={form.texture_by_feel} onValueChange={set("texture_by_feel")}>
              <SelectTrigger><SelectValue placeholder="Pick texture" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sandy">Sandy — gritty, falls apart</SelectItem>
                <SelectItem value="sandy_loam">Sandy loam — slightly sticky</SelectItem>
                <SelectItem value="loamy">Loamy — smooth & holds shape</SelectItem>
                <SelectItem value="clay_loam">Clay loam — sticky, ribbons short</SelectItem>
                <SelectItem value="clay">Clay — very sticky, ribbons long</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Slope">
            <Select value={form.slope_class} onValueChange={set("slope_class")}>
              <SelectTrigger><SelectValue placeholder="Pick slope" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="flat">Flat (&lt; 2%)</SelectItem>
                <SelectItem value="gentle">Gentle (2–8%)</SelectItem>
                <SelectItem value="moderate">Moderate (8–15%)</SelectItem>
                <SelectItem value="steep">Steep (&gt; 15%)</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Drainage (after heavy rain)">
            <Select value={form.drainage_class} onValueChange={set("drainage_class")}>
              <SelectTrigger><SelectValue placeholder="Pick drainage" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="well_drained">Well drained — water disappears in hours</SelectItem>
                <SelectItem value="moderate">Moderate — pools for a day</SelectItem>
                <SelectItem value="poor">Poor — waterlogs for days</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Visible erosion">
            <Select value={form.erosion_observed} onValueChange={set("erosion_observed")}>
              <SelectTrigger><SelectValue placeholder="Pick erosion level" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None visible</SelectItem>
                <SelectItem value="sheet">Sheet wash (thin layer removal)</SelectItem>
                <SelectItem value="rill">Rills (small channels)</SelectItem>
                <SelectItem value="gully">Gullies (deep channels)</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Crop residue management">
            <Select value={form.residue_management} onValueChange={set("residue_management")}>
              <SelectTrigger><SelectValue placeholder="What do you do with residues?" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="incorporated">Plough in / mulch</SelectItem>
                <SelectItem value="grazed">Grazed by livestock</SelectItem>
                <SelectItem value="burned">Burned</SelectItem>
                <SelectItem value="removed">Removed for other use</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Last manure / compost application">
            <Input type="date" value={form.last_manure_application_date} onChange={(e) => set("last_manure_application_date")(e.target.value)} />
          </Field>

          <Field label="Notes">
            <Textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} placeholder="Anything else worth noting" rows={2} />
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save Assessment"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}
