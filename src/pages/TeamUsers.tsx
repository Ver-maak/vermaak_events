import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Users, UserPlus, Copy, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";

const ROLE_LABEL: Record<string, string> = {
  staff: "Staff",
  organizer: "Co-organizer",
  super_admin: "Super admin",
  tenant_admin: "Tenant admin",
  attendee: "Attendee",
  end_user: "End user",
};

const TeamUsers = () => {
  const { roles, profile } = useAuth();
  const qc = useQueryClient();
  const isSuperAdmin = roles.includes("super_admin");
  const isOrganizer = roles.includes("organizer") || isSuperAdmin;
  const orgId = profile?.organization_id || null;

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"staff" | "organizer">("staff");
  const [submitting, setSubmitting] = useState(false);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ["team-users", isSuperAdmin ? "all" : orgId],
    queryFn: async () => {
      let q = supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (!isSuperAdmin && orgId) q = q.eq("organization_id", orgId);
      const { data: profiles, error } = await q;
      if (error) throw error;
      const userIds = profiles?.map((p) => p.id) || [];
      const { data: rolesData } = await supabase
        .from("user_roles").select("user_id, role, id, organization_id").in("user_id", userIds);
      return (profiles || []).map((p) => ({
        ...p,
        user_roles: rolesData?.filter((r) => r.user_id === p.id) || [],
      }));
    },
  });

  const submitInvite = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return toast({ title: "Invalid email", variant: "destructive" });
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-staff", {
        body: { email: trimmed, full_name: fullName, role, organization_id: orgId },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      if (data.credentials) {
        setCredentials(data.credentials);
      } else {
        toast({ title: "User added", description: "They already had an account; role assigned." });
        setInviteOpen(false);
      }
      setEmail(""); setFullName(""); setRole("staff");
      qc.invalidateQueries({ queryKey: ["team-users"] });
    } catch (e: any) {
      toast({ title: "Invite failed", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const removeRole = async (roleId: string) => {
    if (!confirm("Remove this role from the user?")) return;
    const { error } = await supabase.from("user_roles").delete().eq("id", roleId);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Role removed" });
    qc.invalidateQueries({ queryKey: ["team-users"] });
  };

  const copyCreds = async () => {
    if (!credentials) return;
    await navigator.clipboard.writeText(`Email: ${credentials.email}\nTemporary password: ${credentials.password}`);
    toast({ title: "Copied", description: "Share with the team member securely." });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">{isSuperAdmin ? "All Users" : "Team Members"}</h1>
            <p className="text-muted-foreground">
              {isSuperAdmin ? "Manage all platform users" : "Invite staff and manage access to your organization"}
            </p>
          </div>
          {isOrganizer && orgId && (
            <Dialog open={inviteOpen} onOpenChange={(o) => { setInviteOpen(o); if (!o) setCredentials(null); }}>
              <DialogTrigger asChild>
                <Button className="gap-2"><UserPlus className="h-4 w-4" />Invite staff</Button>
              </DialogTrigger>
              <DialogContent>
                {credentials ? (
                  <>
                    <DialogHeader>
                      <DialogTitle>Invitation sent</DialogTitle>
                      <DialogDescription>
                        Share these credentials with the team member — they'll be required to set a new password on first sign-in.
                        This is the only time this password will be shown.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs space-y-1">
                      <p>Email: <span className="font-semibold">{credentials.email}</span></p>
                      <p>Temporary password: <span className="font-semibold">{credentials.password}</span></p>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={copyCreds} className="gap-2"><Copy className="h-4 w-4" />Copy</Button>
                      <Button onClick={() => { setCredentials(null); setInviteOpen(false); }}>Done</Button>
                    </DialogFooter>
                  </>
                ) : (
                  <>
                    <DialogHeader>
                      <DialogTitle>Invite a team member</DialogTitle>
                      <DialogDescription>
                        We'll create an account with a temporary password. They must change it on first login.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label>Email *</Label>
                        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@example.com" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Full name</Label>
                        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Role</Label>
                        <Select value={role} onValueChange={(v) => setRole(v as any)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="staff">Staff — check-in, view events</SelectItem>
                            <SelectItem value="organizer">Co-organizer — manage events & tickets</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
                      <Button onClick={submitInvite} disabled={submitting}>
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send invite"}
                      </Button>
                    </DialogFooter>
                  </>
                )}
              </DialogContent>
            </Dialog>
          )}
        </div>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">Users</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}
              </div>
            ) : users && users.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-xs font-medium text-muted-foreground pb-3">Name</th>
                      <th className="text-left text-xs font-medium text-muted-foreground pb-3">Email</th>
                      <th className="text-left text-xs font-medium text-muted-foreground pb-3">Roles</th>
                      <th className="text-left text-xs font-medium text-muted-foreground pb-3">Status</th>
                      <th className="text-left text-xs font-medium text-muted-foreground pb-3">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-border last:border-0">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                              {u.full_name?.charAt(0)?.toUpperCase() || "U"}
                            </div>
                            <span className="text-sm font-medium">{u.full_name || "Unknown"}</span>
                          </div>
                        </td>
                        <td className="py-3 text-sm text-muted-foreground">{u.email}</td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-1">
                            {(u.user_roles as any[])?.map((r) => (
                              <Badge key={r.id} variant="outline" className="text-xs gap-1">
                                {ROLE_LABEL[r.role] || r.role}
                                {isOrganizer && r.organization_id === orgId && r.role !== "super_admin" && (
                                  <button onClick={() => removeRole(r.id)} className="ml-1 hover:text-destructive">
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                )}
                              </Badge>
                            ))}
                            {(!u.user_roles || u.user_roles.length === 0) && (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3">
                          {u.must_change_password ? (
                            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">Awaiting password reset</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-success/10 text-success border-success/20">{u.status || "active"}</Badge>
                          )}
                        </td>
                        <td className="py-3 text-sm text-muted-foreground">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium">No users found</h3>
                {isOrganizer && <p className="text-sm text-muted-foreground mt-1">Use "Invite staff" to add your first team member.</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default TeamUsers;
