import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Building2, Plus, Settings, Copy, KeyRound, CheckCircle2, Database, Upload, X } from "lucide-react";

const featureLabels: Record<string, string> = {
  wallets: "Wallets",
  payments: "Payment Collection",
  bulk_payments: "Bulk Payments",
  subscriptions: "Subscriptions",
  mobile_money: "Mobile Money",
  cards: "Card Payments",
};

const Organizations = () => {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newOrg, setNewOrg] = useState({ name: "", slug: "", email: "", admin_name: "" });
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string; org: string } | null>(null);
  const [attachDb, setAttachDb] = useState(false);
  const [dbFile, setDbFile] = useState<File | null>(null);
  const [uploadingDb, setUploadingDb] = useState(false);

  const { data: orgs, isLoading } = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (org: typeof newOrg) => {
      const { data, error } = await supabase.functions.invoke("provision-organizer", {
        body: {
          organization_name: org.name,
          slug: org.slug,
          email: org.email,
          full_name: org.admin_name,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as any;
    },
    onSuccess: async (data) => {
      const orgName = data.organization?.name || newOrg.name;
      const orgId = data.organization?.id;

      // Optional database upload
      if (attachDb && dbFile && orgId) {
        setUploadingDb(true);
        try {
          const safe = dbFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `${orgId}/${Date.now()}-${safe}`;
          const { error: upErr } = await supabase.storage
            .from("org-databases")
            .upload(path, dbFile, { upsert: false, contentType: dbFile.type || undefined });
          if (upErr) throw upErr;
          await supabase.from("audit_logs").insert({
            organization_id: orgId,
            action: "organization.database_attached",
            resource_type: "organization",
            resource_id: orgId,
            details: { path, filename: dbFile.name, size: dbFile.size, mime: dbFile.type },
          });
          toast({ title: "Database attached", description: dbFile.name });
        } catch (err: any) {
          toast({ title: "Database upload failed", description: err.message, variant: "destructive" });
        } finally {
          setUploadingDb(false);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      setCreateOpen(false);
      setNewOrg({ name: "", slug: "", email: "", admin_name: "" });
      setAttachDb(false);
      setDbFile(null);
      if (data.credentials) {
        setCredentials({ email: data.credentials.email, password: data.credentials.password, org: orgName });
      } else {
        toast({ title: "Organization created", description: data.already_existed ? "Existing user was added as organizer." : "" });
      }
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleFeature = async (orgId: string, flags: Record<string, boolean>, feature: string) => {
    const updated = { ...flags, [feature]: !flags[feature] };
    const { error } = await supabase.from("organizations").update({ feature_flags: updated }).eq("id", orgId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else queryClient.invalidateQueries({ queryKey: ["organizations"] });
  };

  const toggleStatus = async (orgId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "suspended" : "active";
    const { error } = await supabase.from("organizations").update({ status: newStatus as any }).eq("id", orgId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { queryClient.invalidateQueries({ queryKey: ["organizations"] }); toast({ title: `Organization ${newStatus}` }); }
  };

  const selectedOrgData = orgs?.find(o => o.id === selectedOrg);
  const copy = (t: string) => { navigator.clipboard.writeText(t); toast({ title: "Copied" }); };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Organizations</h1>
            <p className="text-muted-foreground">Manage all tenant organizations</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" />New Organization</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Organization</DialogTitle>
                <DialogDescription>An organizer login will be auto-generated for the email below.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Organization name</Label>
                  <Input value={newOrg.name} onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") })} placeholder="Acme Events" />
                </div>
                <div className="space-y-2">
                  <Label>Slug</Label>
                  <Input value={newOrg.slug} onChange={(e) => setNewOrg({ ...newOrg, slug: e.target.value })} placeholder="acme-events" />
                </div>
                <div className="space-y-2">
                  <Label>Admin contact name</Label>
                  <Input value={newOrg.admin_name} onChange={(e) => setNewOrg({ ...newOrg, admin_name: e.target.value })} placeholder="Jane Doe" />
                </div>
                <div className="space-y-2">
                  <Label>Login email</Label>
                  <Input type="email" value={newOrg.email} onChange={(e) => setNewOrg({ ...newOrg, email: e.target.value })} placeholder="admin@acme.com" />
                  <p className="text-xs text-muted-foreground">A temporary password will be generated and shown once.</p>
                </div>

                {/* Attach database step */}
                <div className="rounded-lg border p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <Database className="h-4 w-4 mt-0.5 text-primary" />
                      <div>
                        <Label className="text-sm">Attach a database?</Label>
                        <p className="text-xs text-muted-foreground">Upload an existing member list or data file (Excel, CSV, JSON, etc.) to link to this organization.</p>
                      </div>
                    </div>
                    <Switch checked={attachDb} onCheckedChange={(v) => { setAttachDb(v); if (!v) setDbFile(null); }} />
                  </div>
                  {attachDb && (
                    <div className="space-y-2">
                      <Input
                        type="file"
                        accept=".xlsx,.xls,.csv,.json,.txt,.tsv,.numbers,.ods,.sql"
                        onChange={(e) => setDbFile(e.target.files?.[0] || null)}
                      />
                      {dbFile && (
                        <div className="flex items-center justify-between text-xs bg-muted/40 rounded px-2 py-1.5">
                          <span className="flex items-center gap-1.5 truncate"><Upload className="h-3 w-3" />{dbFile.name} <span className="text-muted-foreground">({(dbFile.size / 1024).toFixed(1)} KB)</span></span>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setDbFile(null)}><X className="h-3 w-3" /></Button>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">Max 20MB. Stored privately and accessible only to super admins.</p>
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => createMutation.mutate(newOrg)} disabled={createMutation.isPending || uploadingDb || !newOrg.name || !newOrg.slug || !newOrg.email || (attachDb && !dbFile)}>
                  {createMutation.isPending ? "Creating..." : uploadingDb ? "Uploading database..." : "Create & provision"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {isLoading ? (
              <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}</div>
            ) : orgs && orgs.length > 0 ? (
              <div className="space-y-3">
                {orgs.map((org) => (
                  <Card key={org.id} className={`shadow-card cursor-pointer transition-all hover:shadow-elevated ${selectedOrg === org.id ? "ring-2 ring-primary" : ""}`} onClick={() => setSelectedOrg(org.id)}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><Building2 className="h-5 w-5 text-primary" /></div>
                        <div>
                          <p className="font-medium">{org.name}</p>
                          <p className="text-sm text-muted-foreground">/{org.slug}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className={org.status === "active" ? "bg-success/10 text-success border-success/20" : "bg-destructive/10 text-destructive border-destructive/20"}>{org.status}</Badge>
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); toggleStatus(org.id, org.status); }}>
                          {org.status === "active" ? "Suspend" : "Activate"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card><CardContent className="py-12 text-center">
                <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium">No organizations yet</h3>
                <p className="text-sm text-muted-foreground mt-1">Create your first organization to get started.</p>
              </CardContent></Card>
            )}
          </div>

          <div>
            {selectedOrgData ? (
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2"><Settings className="h-4 w-4" />Feature Toggles</CardTitle>
                  <p className="text-sm text-muted-foreground">{selectedOrgData.name}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Object.entries(featureLabels).map(([key, label]) => {
                    const flags = (selectedOrgData.feature_flags as Record<string, boolean>) || {};
                    return (
                      <div key={key} className="flex items-center justify-between">
                        <Label className="text-sm">{label}</Label>
                        <Switch checked={flags[key] || false} onCheckedChange={() => toggleFeature(selectedOrgData.id, flags, key)} />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ) : (
              <Card className="shadow-card"><CardContent className="py-8 text-center">
                <p className="text-sm text-muted-foreground">Select an organization to manage its features</p>
              </CardContent></Card>
            )}
          </div>
        </div>
      </div>

      {/* Generated credentials dialog */}
      <Dialog open={!!credentials} onOpenChange={(o) => !o && setCredentials(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-success" />Organizer account created</DialogTitle>
            <DialogDescription>Share these credentials with {credentials?.org}. They won't be shown again.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Email</Label>
              <div className="flex items-center justify-between gap-2">
                <code className="text-sm break-all">{credentials?.email}</code>
                <Button size="sm" variant="ghost" onClick={() => copy(credentials!.email)}><Copy className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1"><KeyRound className="h-3 w-3" />Temporary password</Label>
              <div className="flex items-center justify-between gap-2">
                <code className="text-sm break-all">{credentials?.password}</code>
                <Button size="sm" variant="ghost" onClick={() => copy(credentials!.password)}><Copy className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Ask the organizer to sign in at /auth and change their password from Settings.</p>
          <DialogFooter><Button onClick={() => setCredentials(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Organizations;
