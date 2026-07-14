import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Beef, Plus, Trash2, Activity } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { SPECIES_OPTIONS } from "@/lib/i18n/livestock";

interface Herd {
  id: string;
  farm_id: string;
  species: string;
  breed?: string | null;
  herd_size: number;
  purpose?: string | null;
  housing_type?: string | null;
  status: string;
  notes?: string | null;
  start_date?: string | null;
}

interface Event {
  id: string;
  herd_id: string;
  event_type: string;
  event_date: string;
  quantity?: number | null;
  value_usd?: number | null;
  notes?: string | null;
}

interface Props {
  farmId: string;
}

const EVENT_TYPES = ["birth", "death", "sale", "vaccination", "feed", "weighing"];

const LivestockManager: React.FC<Props> = ({ farmId }) => {
  const [herds, setHerds] = useState<Herd[]>([]);
  const [events, setEvents] = useState<Record<string, Event[]>>({});
  const [openHerd, setOpenHerd] = useState(false);
  const [openEvent, setOpenEvent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [herdForm, setHerdForm] = useState({
    species: "",
    breed: "",
    herd_size: 0,
    purpose: "",
    housing_type: "",
    notes: "",
  });
  const [eventForm, setEventForm] = useState({
    event_type: "vaccination",
    event_date: new Date().toISOString().slice(0, 10),
    quantity: 0,
    value_usd: "",
    notes: "",
  });

  const fetchHerds = async () => {
    const { data } = await (supabase as any)
      .from("livestock_herds")
      .select("*")
      .eq("farm_id", farmId)
      .order("created_at", { ascending: false });
    setHerds((data || []) as Herd[]);
  };

  const fetchEvents = async (herdId: string) => {
    const { data } = await (supabase as any)
      .from("livestock_events")
      .select("*")
      .eq("herd_id", herdId)
      .order("event_date", { ascending: false })
      .limit(20);
    setEvents((prev) => ({ ...prev, [herdId]: (data || []) as Event[] }));
  };

  useEffect(() => {
    if (farmId) fetchHerds();
  }, [farmId]);

  const createHerd = async () => {
    if (!herdForm.species || herdForm.herd_size < 0) {
      toast({ title: "Missing info", description: "Species and herd size are required", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await (supabase as any).from("livestock_herds").insert({
      farm_id: farmId,
      species: herdForm.species,
      breed: herdForm.breed || null,
      herd_size: herdForm.herd_size,
      purpose: herdForm.purpose || null,
      housing_type: herdForm.housing_type || null,
      notes: herdForm.notes || null,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Herd added" });
    setOpenHerd(false);
    setHerdForm({ species: "", breed: "", herd_size: 0, purpose: "", housing_type: "", notes: "" });
    fetchHerds();
  };

  const deleteHerd = async (id: string) => {
    if (!confirm("Delete this herd and all its event history?")) return;
    await (supabase as any).from("livestock_herds").delete().eq("id", id);
    fetchHerds();
  };

  const logEvent = async (herdId: string) => {
    setLoading(true);
    const { error } = await (supabase as any).from("livestock_events").insert({
      herd_id: herdId,
      event_type: eventForm.event_type,
      event_date: eventForm.event_date,
      quantity: eventForm.quantity || 0,
      value_usd: eventForm.value_usd ? Number(eventForm.value_usd) : null,
      notes: eventForm.notes || null,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Event logged" });
    setOpenEvent(null);
    setEventForm({ event_type: "vaccination", event_date: new Date().toISOString().slice(0, 10), quantity: 0, value_usd: "", notes: "" });
    fetchEvents(herdId);
  };

  return (
    <Card className="bg-white shadow-sm">
      <CardHeader className="bg-orange-50 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="text-orange-900 flex items-center">
            <Beef className="h-5 w-5 mr-2" />
            Livestock ({herds.length} {herds.length === 1 ? "herd" : "herds"})
          </CardTitle>
          <Dialog open={openHerd} onOpenChange={setOpenHerd}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-orange-600 hover:bg-orange-700">
                <Plus className="h-4 w-4 mr-1" /> Add Herd
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Livestock Herd</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div>
                  <Label>Species *</Label>
                  <Select value={herdForm.species} onValueChange={(v) => setHerdForm({ ...herdForm, species: v })}>
                    <SelectTrigger><SelectValue placeholder="Select species" /></SelectTrigger>
                    <SelectContent>
                      {SPECIES_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Breed</Label>
                  <Input value={herdForm.breed} onChange={(e) => setHerdForm({ ...herdForm, breed: e.target.value })} placeholder="e.g., Mashona, Brahman" />
                </div>
                <div>
                  <Label>Herd size *</Label>
                  <Input type="number" value={herdForm.herd_size} onChange={(e) => setHerdForm({ ...herdForm, herd_size: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Purpose</Label>
                  <Select value={herdForm.purpose} onValueChange={(v) => setHerdForm({ ...herdForm, purpose: v })}>
                    <SelectTrigger><SelectValue placeholder="Select purpose" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dairy">Dairy</SelectItem>
                      <SelectItem value="beef">Beef</SelectItem>
                      <SelectItem value="eggs">Eggs</SelectItem>
                      <SelectItem value="meat">Meat</SelectItem>
                      <SelectItem value="breeding">Breeding</SelectItem>
                      <SelectItem value="draught">Draught (work)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Housing</Label>
                  <Input value={herdForm.housing_type} onChange={(e) => setHerdForm({ ...herdForm, housing_type: e.target.value })} placeholder="e.g., kraal, fowl run" />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea value={herdForm.notes} onChange={(e) => setHerdForm({ ...herdForm, notes: e.target.value })} />
                </div>
                <Button onClick={createHerd} disabled={loading} className="bg-orange-600 hover:bg-orange-700">
                  {loading ? "Saving…" : "Save Herd"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {herds.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Beef className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No livestock recorded yet. Add your first herd to track births, vaccinations and sales.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {herds.map((h) => (
              <div key={h.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">
                      {h.species} {h.breed && <span className="text-muted-foreground text-sm">• {h.breed}</span>}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {h.herd_size} animals {h.purpose && `• ${h.purpose}`} {h.housing_type && `• ${h.housing_type}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{h.status}</Badge>
                    <Dialog open={openEvent === h.id} onOpenChange={(o) => setOpenEvent(o ? h.id : null)}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" onClick={() => fetchEvents(h.id)}>
                          <Activity className="h-4 w-4 mr-1" /> Log
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Log event for {h.species}</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-3">
                          <div>
                            <Label>Event type</Label>
                            <Select value={eventForm.event_type} onValueChange={(v) => setEventForm({ ...eventForm, event_type: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {EVENT_TYPES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Date</Label>
                            <Input type="date" value={eventForm.event_date} onChange={(e) => setEventForm({ ...eventForm, event_date: e.target.value })} />
                          </div>
                          <div>
                            <Label>Quantity (animals affected)</Label>
                            <Input type="number" value={eventForm.quantity} onChange={(e) => setEventForm({ ...eventForm, quantity: Number(e.target.value) })} />
                          </div>
                          <div>
                            <Label>Value (USD, optional)</Label>
                            <Input type="number" value={eventForm.value_usd} onChange={(e) => setEventForm({ ...eventForm, value_usd: e.target.value })} placeholder="Sale or feed cost" />
                          </div>
                          <div>
                            <Label>Notes</Label>
                            <Textarea value={eventForm.notes} onChange={(e) => setEventForm({ ...eventForm, notes: e.target.value })} />
                          </div>
                          <Button onClick={() => logEvent(h.id)} disabled={loading} className="bg-orange-600 hover:bg-orange-700">
                            {loading ? "Saving…" : "Save Event"}
                          </Button>
                        </div>
                        {events[h.id] && events[h.id].length > 0 && (
                          <div className="mt-4 border-t pt-3 max-h-48 overflow-y-auto">
                            <div className="text-xs font-semibold mb-2 text-muted-foreground">Recent events</div>
                            {events[h.id].map((e) => (
                              <div key={e.id} className="text-sm py-1 flex justify-between">
                                <span><Badge variant="secondary" className="mr-2">{e.event_type}</Badge>{e.event_date}</span>
                                <span className="text-muted-foreground">{e.quantity || ""}{e.value_usd ? ` • $${e.value_usd}` : ""}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>
                    <Button size="sm" variant="ghost" onClick={() => deleteHerd(h.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LivestockManager;
