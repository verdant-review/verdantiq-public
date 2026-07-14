import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Edit, Plus, ExternalLink, Save, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import OrgTeamPanel from "./OrgTeamPanel";

const ORG_TYPES = ["exporter", "ngo", "processor", "government", "cooperative"] as const;
const ORG_STATUSES = ["prospect", "pilot", "active", "suspended", "archived"] as const;
const ORG_PLANS = ["pilot", "growth", "enterprise"] as const;

type OrgType = typeof ORG_TYPES[number];
type OrgStatus = typeof ORG_STATUSES[number];
type OrgPlan = typeof ORG_PLANS[number];

interface Org {
  id: string;
  slug: string;
  name: string;
  type: OrgType;
  status: OrgStatus;
  plan: OrgPlan;
  pilot_expires_at: string | null;
  metadata: any;
}

interface Branding {
  organization_id: string;
  logo_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  tagline: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
}

const emptyOrg = {
  slug: "",
  name: "",
  type: "exporter" as OrgType,
  status: "prospect" as OrgStatus,
  plan: "pilot" as OrgPlan,
  pilot_expires_at: "",
  description: "",
};

const emptyBranding = {
  logo_url: "",
  primary_color: "#1B5E20",
  accent_color: "#FBC02D",
  tagline: "",
  contact_email: "",
  contact_phone: "",
  website_url: "",
};

const OrgsAdmin = () => {
  const { toast } = useToast();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Org | null>(null);
  const [creating, setCreating] = useState(false);
  const [orgForm, setOrgForm] = useState({ ...emptyOrg });
  const [brandingForm, setBrandingForm] = useState({ ...emptyBranding });
  const [saving, setSaving] = useState(false);

  const fetchOrgs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("organizations")
      .select("id, slug, name, type, status, plan, pilot_expires_at, metadata")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Error loading organizations", description: error.message, variant: "destructive" });
    } else {
      setOrgs((data || []) as Org[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrgs();
  }, []);

  const openEdit = async (org: Org) => {
    setEditingOrg(org);
    setCreating(false);
    setOrgForm({
      slug: org.slug,
      name: org.name,
      type: org.type,
      status: org.status,
      plan: org.plan,
      pilot_expires_at: org.pilot_expires_at ? org.pilot_expires_at.slice(0, 10) : "",
      description: (org.metadata?.description as string) || "",
    });
    const { data: b } = await supabase
      .from("org_branding")
      .select("*")
      .eq("organization_id", org.id)
      .maybeSingle();
    setBrandingForm({
      logo_url: b?.logo_url || "",
      primary_color: b?.primary_color || "#1B5E20",
      accent_color: b?.accent_color || "#FBC02D",
      tagline: b?.tagline || "",
      contact_email: b?.contact_email || "",
      contact_phone: b?.contact_phone || "",
      website_url: b?.website_url || "",
    });
  };

  const openCreate = () => {
    setEditingOrg(null);
    setCreating(true);
    setOrgForm({ ...emptyOrg });
    setBrandingForm({ ...emptyBranding });
  };

  const closeDialog = () => {
    setEditingOrg(null);
    setCreating(false);
  };

  const handleSave = async () => {
    if (!orgForm.slug || !orgForm.name) {
      toast({ title: "Missing required fields", description: "Slug and name are required", variant: "destructive" });
      return;
    }
    setSaving(true);

    const orgPayload = {
      slug: orgForm.slug.toLowerCase().trim(),
      name: orgForm.name.trim(),
      type: orgForm.type,
      status: orgForm.status,
      plan: orgForm.plan,
      pilot_expires_at: orgForm.pilot_expires_at ? new Date(orgForm.pilot_expires_at).toISOString() : null,
      metadata: { description: orgForm.description || "" },
    };

    let orgId = editingOrg?.id;

    if (editingOrg) {
      const { error } = await supabase.from("organizations").update(orgPayload).eq("id", editingOrg.id);
      if (error) {
        toast({ title: "Update failed", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await supabase.from("organizations").insert(orgPayload).select("id").single();
      if (error || !data) {
        toast({ title: "Create failed", description: error?.message || "Unknown error", variant: "destructive" });
        setSaving(false);
        return;
      }
      orgId = data.id;
    }

    if (orgId) {
      const brandingPayload = {
        organization_id: orgId,
        logo_url: brandingForm.logo_url || null,
        primary_color: brandingForm.primary_color || null,
        accent_color: brandingForm.accent_color || null,
        tagline: brandingForm.tagline || null,
        contact_email: brandingForm.contact_email || null,
        contact_phone: brandingForm.contact_phone || null,
        website_url: brandingForm.website_url || null,
        updated_at: new Date().toISOString(),
      };
      const { error: bErr } = await supabase
        .from("org_branding")
        .upsert(brandingPayload, { onConflict: "organization_id" });
      if (bErr) {
        toast({ title: "Branding save failed", description: bErr.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    toast({ title: editingOrg ? "Organization updated" : "Organization created" });
    setSaving(false);
    closeDialog();
    fetchOrgs();
  };

  const statusVariant = (s: OrgStatus) => {
    switch (s) {
      case "active": return "bg-green-100 text-green-900";
      case "pilot": return "bg-yellow-100 text-yellow-900";
      case "suspended": return "bg-red-100 text-red-900";
      case "archived": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const dialogOpen = creating || !!editingOrg;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Outgrower Organizations</CardTitle>
            <CardDescription>Manage demo & live organization accounts and branding</CardDescription>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> New Organization
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : orgs.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No organizations yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgs.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.name}</TableCell>
                    <TableCell><code className="text-xs">{o.slug}</code></TableCell>
                    <TableCell className="capitalize">{o.type}</TableCell>
                    <TableCell><Badge className={statusVariant(o.status)}>{o.status}</Badge></TableCell>
                    <TableCell className="capitalize">{o.plan}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/org/${o.slug}`} target="_blank">
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEdit(o)}>
                        <Edit className="h-4 w-4 mr-1" /> Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingOrg ? `Edit ${editingOrg.name}` : "Create Organization"}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="details">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="branding">Branding</TabsTrigger>
              <TabsTrigger value="team" disabled={!editingOrg}>Team</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Name *</Label>
                  <Input value={orgForm.name} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} />
                </div>
                <div>
                  <Label>Slug *</Label>
                  <Input
                    value={orgForm.slug}
                    onChange={(e) => setOrgForm({ ...orgForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
                    placeholder="my-org"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Type</Label>
                  <Select value={orgForm.type} onValueChange={(v) => setOrgForm({ ...orgForm, type: v as OrgType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ORG_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={orgForm.status} onValueChange={(v) => setOrgForm({ ...orgForm, status: v as OrgStatus })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ORG_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Plan</Label>
                  <Select value={orgForm.plan} onValueChange={(v) => setOrgForm({ ...orgForm, plan: v as OrgPlan })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ORG_PLANS.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Pilot expires at</Label>
                <Input
                  type="date"
                  value={orgForm.pilot_expires_at}
                  onChange={(e) => setOrgForm({ ...orgForm, pilot_expires_at: e.target.value })}
                />
              </div>
              <div>
                <Label>Description (internal)</Label>
                <Textarea
                  rows={3}
                  value={orgForm.description}
                  onChange={(e) => setOrgForm({ ...orgForm, description: e.target.value })}
                  placeholder="Brief note about this organization, programme scope, etc."
                />
              </div>
            </TabsContent>

            <TabsContent value="branding" className="space-y-4 pt-4">
              <div>
                <Label>Logo URL</Label>
                <Input
                  value={brandingForm.logo_url}
                  onChange={(e) => setBrandingForm({ ...brandingForm, logo_url: e.target.value })}
                  placeholder="https://…/logo.png"
                />
                {brandingForm.logo_url && (
                  <img src={brandingForm.logo_url} alt="logo preview" className="h-16 mt-2 border rounded p-1 bg-white object-contain" />
                )}
              </div>
              <div>
                <Label>Tagline</Label>
                <Input
                  value={brandingForm.tagline}
                  onChange={(e) => setBrandingForm({ ...brandingForm, tagline: e.target.value })}
                  placeholder="Empowering farmers across…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Primary color</Label>
                  <div className="flex gap-2">
                    <Input type="color" className="w-16 p-1" value={brandingForm.primary_color}
                      onChange={(e) => setBrandingForm({ ...brandingForm, primary_color: e.target.value })} />
                    <Input value={brandingForm.primary_color}
                      onChange={(e) => setBrandingForm({ ...brandingForm, primary_color: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Accent color</Label>
                  <div className="flex gap-2">
                    <Input type="color" className="w-16 p-1" value={brandingForm.accent_color}
                      onChange={(e) => setBrandingForm({ ...brandingForm, accent_color: e.target.value })} />
                    <Input value={brandingForm.accent_color}
                      onChange={(e) => setBrandingForm({ ...brandingForm, accent_color: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Contact email</Label>
                  <Input value={brandingForm.contact_email}
                    onChange={(e) => setBrandingForm({ ...brandingForm, contact_email: e.target.value })} />
                </div>
                <div>
                  <Label>Contact phone</Label>
                  <Input value={brandingForm.contact_phone}
                    onChange={(e) => setBrandingForm({ ...brandingForm, contact_phone: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Website</Label>
                <Input value={brandingForm.website_url}
                  onChange={(e) => setBrandingForm({ ...brandingForm, website_url: e.target.value })}
                  placeholder="https://…" />
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div
                  className="p-4 text-white"
                  style={{ background: `linear-gradient(135deg, ${brandingForm.primary_color} 0%, ${brandingForm.primary_color}dd 100%)` }}
                >
                  <div className="flex items-center gap-3">
                    {brandingForm.logo_url ? (
                      <img src={brandingForm.logo_url} alt="" className="h-10 w-10 rounded bg-white p-1 object-contain" />
                    ) : (
                      <div className="h-10 w-10 rounded flex items-center justify-center font-bold"
                        style={{ background: brandingForm.accent_color, color: brandingForm.primary_color }}>
                        {(orgForm.name || "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="font-bold">{orgForm.name || "Organization name"}</div>
                      {brandingForm.tagline && <div className="text-xs opacity-80">{brandingForm.tagline}</div>}
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="team" className="pt-4">
              {editingOrg ? (
                <OrgTeamPanel
                  organizationId={editingOrg.id}
                  organizationSlug={editingOrg.slug}
                  organizationName={editingOrg.name}
                  organizationStatus={editingOrg.status}
                  onAfterTransfer={fetchOrgs}
                />
              ) : (
                <p className="text-sm text-muted-foreground py-6 text-center">Save the organisation first, then manage its team.</p>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {editingOrg ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrgsAdmin;
