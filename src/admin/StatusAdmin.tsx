import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Play, Loader2 } from "lucide-react";

interface Component { id: string; name: string; }
interface Incident {
  id: string; title: string; description: string | null;
  severity: string; status: string; component_id: string | null;
  started_at: string; resolved_at: string | null;
}

const StatusAdmin = () => {
  const [components, setComponents] = useState<Component[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [agroUsage, setAgroUsage] = useState<{ ha: number; polygons: number } | null>(null);

  // new incident form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("minor");
  const [componentId, setComponentId] = useState<string>("none");

  const load = async () => {
    setLoading(true);
    const [{ data: comps }, { data: incs }, { data: polys }] = await Promise.all([
      supabase.from("service_components").select("id,name").order("display_order"),
      supabase.from("incidents").select("*").order("started_at", { ascending: false }).limit(50),
      supabase.from("farm_polygons").select("area_ha"),
    ]);
    setComponents((comps as Component[]) || []);
    setIncidents((incs as Incident[]) || []);
    const rows = (polys as Array<{ area_ha: number }>) || [];
    setAgroUsage({
      ha: rows.reduce((s, r) => s + Number(r.area_ha || 0), 0),
      polygons: rows.length,
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const createIncident = async () => {
    if (!title.trim()) { toast.error("Title required"); return; }
    const { error } = await supabase.from("incidents").insert({
      title: title.trim(),
      description: description.trim() || null,
      severity,
      status: "investigating",
      component_id: componentId === "none" ? null : componentId,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Incident opened");
    setTitle(""); setDescription(""); setSeverity("minor"); setComponentId("none");
    load();
  };

  const updateIncidentStatus = async (id: string, status: string) => {
    const patch: any = { status };
    if (status === "resolved") patch.resolved_at = new Date().toISOString();
    const { error } = await supabase.from("incidents").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const runHealthCheck = async () => {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke("status-check", { body: {} });
      if (error) throw error;
      toast.success("Health check completed");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to run health check");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Service health</CardTitle>
          <Button size="sm" onClick={runHealthCheck} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
            Run health check now
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Automated checks run every 2 minutes. View the public page at{" "}
            <a href="/status" target="_blank" rel="noopener" className="underline">/status</a>.
          </p>
        </CardContent>
      </Card>

      {agroUsage && (
        <Card>
          <CardHeader><CardTitle className="text-base">AgroMonitoring (Sentinel-2 NDVI) usage</CardTitle></CardHeader>
          <CardContent>
            <div className="text-sm">
              <span className="font-semibold">{agroUsage.ha.toFixed(1)} / 1000 ha</span> tracked across{" "}
              <span className="font-semibold">{agroUsage.polygons}</span> polygon{agroUsage.polygons === 1 ? "" : "s"}.
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Free tier limit is 1,000 ha. We stop creating new polygons at 950 ha and fall back to weather-derived NDVI. Upgrade to AgroMonitoring Startup (~$40/mo) for 10,000 ha.
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Open an incident</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Weather data delays" />
            </div>
            <div>
              <Label>Component</Label>
              <Select value={componentId} onValueChange={setComponentId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— none —</SelectItem>
                  {components.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Severity</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="minor">Minor</SelectItem>
                  <SelectItem value="major">Major</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <Button onClick={createIncident} className="bg-green-900 hover:bg-green-800">Open incident</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent incidents</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {loading && <Loader2 className="h-5 w-5 animate-spin" />}
          {!loading && incidents.length === 0 && (
            <p className="text-sm text-muted-foreground">No incidents.</p>
          )}
          {incidents.map((inc) => (
            <div key={inc.id} className="border rounded p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{inc.title}</div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{inc.severity}</Badge>
                  <Select value={inc.status} onValueChange={(v) => updateIncidentStatus(inc.id, v)}>
                    <SelectTrigger className="w-36 h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="investigating">Investigating</SelectItem>
                      <SelectItem value="identified">Identified</SelectItem>
                      <SelectItem value="monitoring">Monitoring</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Started {new Date(inc.started_at).toLocaleString()}
                {inc.resolved_at && ` · Resolved ${new Date(inc.resolved_at).toLocaleString()}`}
              </div>
              {inc.description && <p className="text-sm">{inc.description}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default StatusAdmin;
