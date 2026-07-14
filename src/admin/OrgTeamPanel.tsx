import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, UserPlus, ShieldCheck, Crown, FileSignature } from "lucide-react";

const ORG_ROLES = ["org_owner", "org_manager", "org_agronomist", "org_extension", "org_viewer"] as const;
type OrgRole = typeof ORG_ROLES[number];

interface Member {
  id: string;
  user_id: string;
  role: OrgRole;
  accepted_at: string | null;
  invited_at: string;
  profile?: { full_name: string | null; email: string | null } | null;
}

interface Props {
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  organizationStatus: string;
  onAfterTransfer?: () => void;
}

const OrgTeamPanel = ({ organizationId, organizationSlug, organizationName, organizationStatus, onAfterTransfer }: Props) => {
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hasDpa, setHasDpa] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<OrgRole>("org_manager");

  const load = async () => {
    setLoading(true);
    const { data: mems } = await supabase
      .from("org_members")
      .select("id, user_id, role, accepted_at, invited_at")
      .eq("organization_id", organizationId)
      .order("invited_at", { ascending: true });

    const userIds = (mems || []).map((m: any) => m.user_id);
    const profileMap = new Map<string, { full_name: string | null; email: string | null }>();
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      (profs || []).forEach((p: any) => profileMap.set(p.id, { full_name: p.full_name, email: p.email }));
    }
    setMembers(((mems || []) as any[]).map((m) => ({ ...m, profile: profileMap.get(m.user_id) || null })));

    const { count } = await supabase
      .from("data_license_acceptance")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId);
    setHasDpa((count || 0) > 0);

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [organizationId]);

  const handleAdd = async () => {
    if (!addEmail.trim()) return;
    setBusy(true);
    const { data: prof, error: pErr } = await supabase
      .from("profiles")
      .select("id, email")
      .ilike("email", addEmail.trim())
      .maybeSingle();
    if (pErr || !prof) {
      toast({
        title: "User not found",
        description: "Ask them to sign up first, then invite them again. (Email lookup requires admin access.)",
        variant: "destructive",
      });
      setBusy(false);
      return;
    }
    const { error } = await supabase.from("org_members").insert({
      organization_id: organizationId,
      user_id: prof.id,
      role: addRole,
      accepted_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) {
      toast({ title: "Could not add member", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Member added", description: `${prof.email} added as ${addRole.replace("org_", "")}` });
    setAddEmail("");
    setAddRole("org_manager");
    load();
  };

  const handleRoleChange = async (memberId: string, role: OrgRole) => {
    const { error } = await supabase.from("org_members").update({ role }).eq("id", memberId);
    if (error) {
      toast({ title: "Role update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Role updated" });
    load();
  };

  const handleRemove = async (memberId: string) => {
    const { error } = await supabase.from("org_members").delete().eq("id", memberId);
    if (error) {
      toast({ title: "Remove failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Member removed" });
    load();
  };

  const handleRecordDpa = async () => {
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      return;
    }
    const { error } = await supabase.from("data_license_acceptance").insert({
      organization_id: organizationId,
      accepted_by_user_id: user.id,
      license_version: "v1.0",
    });
    setBusy(false);
    if (error) {
      toast({ title: "Could not record DPA", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Data Processing Agreement recorded" });
    setHasDpa(true);
  };

  const handleTransferOwnership = async (userId: string) => {
    if (!hasDpa) {
      toast({ title: "DPA required", description: "Record a Data Processing Agreement first.", variant: "destructive" });
      return;
    }
    if (!confirm(`Transfer ownership of "${organizationName}" to this member?\n\nThis will:\n• Set the org to active\n• Make this user the org_owner\n• Demote any other owners to viewer\n• Retire the public demo`)) return;

    setBusy(true);
    const { data, error } = await supabase.functions.invoke("transfer-org-ownership", {
      body: {
        org_id: organizationId,
        new_owner_user_id: userId,
        confirmation_slug: organizationSlug,
        grace_period_days: 14,
      },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast({
        title: "Transfer failed",
        description: error?.message || (data as any)?.error || "Unknown error",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Ownership transferred", description: "Organisation is now live." });
    load();
    onAfterTransfer?.();
  };

  return (
    <div className="space-y-4">
      {/* Add member */}
      <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" />
          <h4 className="font-medium text-sm">Add a team member</h4>
        </div>
        <div className="grid sm:grid-cols-[1fr_180px_auto] gap-2">
          <div>
            <Label className="text-xs">Email of existing user</Label>
            <Input
              type="email"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              placeholder="member@example.com"
            />
          </div>
          <div>
            <Label className="text-xs">Role</Label>
            <Select value={addRole} onValueChange={(v) => setAddRole(v as OrgRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORG_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{r.replace("org_", "")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={handleAdd} disabled={busy || !addEmail.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          The user must already have a VerdantOS account. They will appear as accepted immediately.
        </p>
      </div>

      {/* DPA */}
      <div className={`border rounded-lg p-4 flex items-start gap-3 ${hasDpa ? "bg-green-50 dark:bg-green-950/30 border-green-300" : "bg-amber-50 dark:bg-amber-950/30 border-amber-300"}`}>
        <FileSignature className={`h-5 w-5 mt-0.5 ${hasDpa ? "text-green-700" : "text-amber-700"}`} />
        <div className="flex-1">
          <div className="font-medium text-sm">
            Data Processing Agreement
            {hasDpa ? <Badge variant="outline" className="ml-2 text-xs">on file</Badge> : <Badge variant="outline" className="ml-2 text-xs">missing</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {hasDpa
              ? "Required to transfer ownership and go live."
              : "Record the signed agreement before transferring ownership."}
          </p>
        </div>
        {!hasDpa && (
          <Button size="sm" variant="outline" onClick={handleRecordDpa} disabled={busy}>
            Record DPA
          </Button>
        )}
      </div>

      {/* Members list */}
      <div>
        <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" /> Current members ({members.length})
        </h4>
        {loading ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>
        ) : members.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded">
            No members yet. Add the customer's primary contact above.
          </div>
        ) : (
          <ul className="space-y-2">
            {members.map((m) => (
              <li key={m.id} className="border rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{m.profile?.full_name || "—"}</span>
                    {m.role === "org_owner" && <Crown className="h-3.5 w-3.5 text-amber-600" />}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{m.profile?.email || m.user_id}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={m.role} onValueChange={(v) => handleRoleChange(m.id, v as OrgRole)}>
                    <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ORG_ROLES.map((r) => (
                        <SelectItem key={r} value={r} className="text-xs">{r.replace("org_", "")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {organizationStatus !== "active" && m.role !== "org_owner" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleTransferOwnership(m.user_id)}
                      disabled={busy || !hasDpa}
                      className="h-8 text-xs"
                      title={!hasDpa ? "Record DPA first" : "Promote to owner & go live"}
                    >
                      <Crown className="h-3.5 w-3.5 mr-1" /> Make owner & go live
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemove(m.id)}
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default OrgTeamPanel;
