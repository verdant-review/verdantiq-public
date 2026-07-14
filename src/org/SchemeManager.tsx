import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Upload, FileText, Users, Copy, Send, MessageCircle, Link as LinkIcon } from "lucide-react";

interface Scheme {
  id: string;
  name: string;
  season: string;
  status: string;
  target_farmer_count: number | null;
  start_date: string | null;
  end_date: string | null;
  commodity_id: string | null;
}

interface Commodity { id: string; name: string; slug: string; }

interface Props {
  organizationId: string;
  canManage: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  recruiting: "bg-blue-100 text-blue-900",
  active: "bg-green-100 text-green-900",
  closed: "bg-yellow-100 text-yellow-900",
  archived: "bg-muted text-muted-foreground",
};

const SchemeManager: React.FC<Props> = ({ organizationId, canManage }) => {
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [commodities, setCommodities] = useState<Commodity[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteFor, setInviteFor] = useState<Scheme | null>(null);
  const [manageInvitesFor, setManageInvitesFor] = useState<Scheme | null>(null);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // create form
  const [form, setForm] = useState({ name: "", season: "", commodity_id: "", target: "", start_date: "", end_date: "" });
  // invite form
  const [csvText, setCsvText] = useState("");
  // counts
  const [counts, setCounts] = useState<Record<string, { enrolled: number; invited: number }>>({});

  const loadSchemes = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("schemes")
      .select("id, name, season, status, target_farmer_count, start_date, end_date, commodity_id")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    setSchemes(data || []);

    if (data && data.length) {
      const ids = data.map((s) => s.id);
      const [{ data: enrolls }, { data: invs }] = await Promise.all([
        supabase.from("scheme_enrollments").select("scheme_id").in("scheme_id", ids),
        supabase.from("scheme_invitations").select("scheme_id").in("scheme_id", ids).eq("status", "pending"),
      ]);
      const c: Record<string, { enrolled: number; invited: number }> = {};
      ids.forEach((id) => (c[id] = { enrolled: 0, invited: 0 }));
      (enrolls || []).forEach((e: any) => (c[e.scheme_id].enrolled += 1));
      (invs || []).forEach((i: any) => (c[i.scheme_id].invited += 1));
      setCounts(c);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadSchemes();
    supabase.from("commodities").select("id, name, slug").eq("is_active", true).then(({ data }) => setCommodities(data || []));
  }, [organizationId]);

  const handleCreate = async () => {
    if (!form.name || !form.season) {
      toast({ title: "Name and season are required", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("schemes").insert({
      organization_id: organizationId,
      name: form.name,
      season: form.season,
      commodity_id: form.commodity_id || null,
      target_farmer_count: form.target ? parseInt(form.target, 10) : null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      status: "recruiting",
    });
    setBusy(false);
    if (error) {
      toast({ title: "Could not create scheme", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Scheme created" });
    setCreateOpen(false);
    setForm({ name: "", season: "", commodity_id: "", target: "", start_date: "", end_date: "" });
    loadSchemes();
  };

  const loadInvitations = async (schemeId: string) => {
    setInvitesLoading(true);
    const { data } = await supabase
      .from("scheme_invitations")
      .select("id, phone_number, email, farmer_name, token, status, metadata, created_at, accepted_at")
      .eq("scheme_id", schemeId)
      .order("created_at", { ascending: false });
    setInvitations(data || []);
    setInvitesLoading(false);
  };

  const inviteUrl = (token: string) => `${window.location.origin}/invite/${token}`;

  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(token));
      toast({ title: "Invite link copied" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const openWhatsApp = (phone: string, token: string, farmerName?: string) => {
    const greet = farmerName ? `Hello ${farmerName},` : "Hello,";
    const text = encodeURIComponent(`${greet} You're invited to join a scheme on VerdantOS. Tap to accept: ${inviteUrl(token)}`);
    const clean = phone.replace(/[^0-9]/g, "");
    window.open(`https://wa.me/${clean}?text=${text}`, "_blank");
  };

  const dispatchInvites = async (ids: string[]) => {
    if (ids.length === 0) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("scheme-invite-dispatch", {
      body: { invitation_ids: ids, base_url: window.location.origin },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast({ title: "Send failed", description: error?.message || (data as any)?.error, variant: "destructive" });
      return;
    }
    const r = data as any;
    toast({ title: `Sent ${r.sent}`, description: `Skipped ${r.skipped}, failed ${r.failed}` });
    if (manageInvitesFor) loadInvitations(manageInvitesFor.id);
  };

  const handleInvite = async () => {
    if (!inviteFor || !csvText.trim()) return;
    const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const recipients = lines.map((line) => {
      const [phone_number, email, farmer_name] = line.split(",").map((c) => c?.trim() || "");
      return { phone_number, email, farmer_name };
    });

    setBusy(true);
    const { data, error } = await supabase.functions.invoke("scheme-invite-bulk", {
      body: { scheme_id: inviteFor.id, recipients },
    });
    setBusy(false);

    if (error || (data as any)?.error) {
      toast({ title: "Invitations failed", description: error?.message || (data as any)?.error, variant: "destructive" });
      return;
    }
    const created = (data as any).created;
    toast({ title: `${created} invitations created`, description: "Opening invitation manager…" });
    const scheme = inviteFor;
    setInviteFor(null);
    setCsvText("");
    loadSchemes();
    // Auto-open manage dialog so user can copy/send tokens
    setManageInvitesFor(scheme);
    loadInvitations(scheme.id);
  };

  const handleGenerateReport = async (scheme: Scheme) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("generate-scheme-report", {
      body: { scheme_id: scheme.id, report_type: "season_summary" },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast({ title: "Report failed", description: error?.message || (data as any)?.error, variant: "destructive" });
      return;
    }
    toast({ title: "Report generated", description: "View it in the Reports section below." });
    // Trigger a refresh of reports list via event
    window.dispatchEvent(new CustomEvent("scheme-reports-refresh"));
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading schemes…</p>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Schemes</CardTitle>
        {canManage && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New scheme</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create scheme</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="2026 Macadamia Programme" /></div>
                <div><Label>Season</Label><Input value={form.season} onChange={(e) => setForm({ ...form, season: e.target.value })} placeholder="2026" /></div>
                <div>
                  <Label>Commodity</Label>
                  <Select value={form.commodity_id} onValueChange={(v) => setForm({ ...form, commodity_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                    <SelectContent>{commodities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Start</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
                  <div><Label>End</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
                </div>
                <div><Label>Target farmers</Label><Input type="number" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button onClick={handleCreate} disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {schemes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No schemes yet. {canManage && "Create one to start enrolling farmers."}</p>
        ) : (
          <ul className="space-y-3">
            {schemes.map((s) => {
              const c = counts[s.id] || { enrolled: 0, invited: 0 };
              return (
                <li key={s.id} className="border rounded p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{s.name}</span>
                      <Badge className={STATUS_COLORS[s.status] || ""}>{s.status}</Badge>
                      <span className="text-xs text-muted-foreground">Season {s.season}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {c.enrolled} enrolled · {c.invited} pending invites
                      {s.target_farmer_count ? ` · target ${s.target_farmer_count}` : ""}
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => setInviteFor(s)}>
                        <Upload className="h-4 w-4 mr-1" /> Invite
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setManageInvitesFor(s); loadInvitations(s.id); }}>
                        <LinkIcon className="h-4 w-4 mr-1" /> Invites ({c.invited})
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleGenerateReport(s)} disabled={busy}>
                        <FileText className="h-4 w-4 mr-1" /> Report
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {/* Invite Dialog */}
      <Dialog open={!!inviteFor} onOpenChange={(o) => !o && setInviteFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite farmers to {inviteFor?.name}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>CSV: <code className="text-xs">phone,email,name</code> — one per line</Label>
            <Textarea
              rows={8}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={"+263771234567,farmer@example.com,Tendai Moyo\n+263772345678,,Sipho Ncube"}
            />
            <p className="text-xs text-muted-foreground">Each row creates a pending invitation with a unique token. Send the link <code>/invite/&lt;token&gt;</code> via WhatsApp.</p>
          </div>
          <DialogFooter>
            <Button onClick={handleInvite} disabled={busy || !csvText.trim()}>
              {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Create invitations
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Invitations Dialog */}
      <Dialog open={!!manageInvitesFor} onOpenChange={(o) => { if (!o) { setManageInvitesFor(null); setInvitations([]); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Invitations · {manageInvitesFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between gap-2 pb-2 border-b">
            <p className="text-xs text-muted-foreground">
              Copy a link, open WhatsApp manually, or auto-send all unsent via the platform.
            </p>
            <Button
              size="sm"
              onClick={() => dispatchInvites(invitations.filter((i) => i.status === "pending" && i.phone_number && !i.metadata?.sent_at).map((i) => i.id))}
              disabled={busy || invitations.filter((i) => i.status === "pending" && i.phone_number && !i.metadata?.sent_at).length === 0}
            >
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Send all unsent
            </Button>
          </div>
          <div className="overflow-y-auto flex-1 -mx-6 px-6">
            {invitesLoading ? (
              <p className="text-sm text-muted-foreground py-4">Loading…</p>
            ) : invitations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No invitations yet. Use the Invite button to create some.</p>
            ) : (
              <ul className="divide-y">
                {invitations.map((inv) => {
                  const sentAt = inv.metadata?.sent_at as string | undefined;
                  return (
                    <li key={inv.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{inv.farmer_name || "Unnamed"}</span>
                          <Badge variant={inv.status === "accepted" ? "default" : "secondary"} className="text-xs">{inv.status}</Badge>
                          {sentAt && inv.status === "pending" && <Badge variant="outline" className="text-xs">sent</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {inv.phone_number || "—"} {inv.email ? `· ${inv.email}` : ""}
                        </div>
                        <code className="text-[10px] text-muted-foreground break-all">{inviteUrl(inv.token)}</code>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => copyLink(inv.token)} title="Copy link">
                          <Copy className="h-4 w-4" />
                        </Button>
                        {inv.phone_number && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => openWhatsApp(inv.phone_number, inv.token, inv.farmer_name)} title="Open in WhatsApp">
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                            {inv.status === "pending" && (
                              <Button size="sm" variant="ghost" onClick={() => dispatchInvites([inv.id])} disabled={busy} title="Send via platform">
                                <Send className="h-4 w-4" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default SchemeManager;
