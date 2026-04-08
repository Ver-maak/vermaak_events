import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Building2, Plus, Users, Wallet, Settings } from "lucide-react";

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
  const [newOrg, setNewOrg] = useState({ name: "", slug: "" });
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);

  const { data: orgs, isLoading } = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (org: { name: string; slug: string }) => {
      const { error } = await supabase.from("organizations").insert(org);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      setCreateOpen(false);
      setNewOrg({ name: "", slug: "" });
      toast({ title: "Organization created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleFeature = async (orgId: string, flags: Record<string, boolean>, feature: string) => {
    const updated = { ...flags, [feature]: !flags[feature] };
    const { error } = await supabase.from("organizations").update({ feature_flags: updated }).eq("id", orgId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
    }
  };

  const toggleStatus = async (orgId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "suspended" : "active";
    const { error } = await supabase.from("organizations").update({ status: newStatus as any }).eq("id", orgId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      toast({ title: `Organization ${newStatus}` });
    }
  };

  const selectedOrgData = orgs?.find(o => o.id === selectedOrg);

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
              <DialogHeader><DialogTitle>Create Organization</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={newOrg.name} onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") })} placeholder="Acme Corp" />
                </div>
                <div className="space-y-2">
                  <Label>Slug</Label>
                  <Input value={newOrg.slug} onChange={(e) => setNewOrg({ ...newOrg, slug: e.target.value })} placeholder="acme-corp" />
                </div>
                <Button onClick={() => createMutation.mutate(newOrg)} className="w-full" disabled={createMutation.isPending || !newOrg.name || !newOrg.slug}>
                  {createMutation.isPending ? "Creating..." : "Create Organization"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}
              </div>
            ) : orgs && orgs.length > 0 ? (
              <div className="space-y-3">
                {orgs.map((org) => (
                  <Card
                    key={org.id}
                    className={`shadow-card cursor-pointer transition-all hover:shadow-elevated ${selectedOrg === org.id ? "ring-2 ring-primary" : ""}`}
                    onClick={() => setSelectedOrg(org.id)}
                  >
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{org.name}</p>
                          <p className="text-sm text-muted-foreground">/{org.slug}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className={org.status === "active" ? "bg-success/10 text-success border-success/20" : "bg-destructive/10 text-destructive border-destructive/20"}>
                          {org.status}
                        </Badge>
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); toggleStatus(org.id, org.status); }}>
                          {org.status === "active" ? "Suspend" : "Activate"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-medium">No organizations yet</h3>
                  <p className="text-sm text-muted-foreground mt-1">Create your first organization to get started.</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Feature toggles panel */}
          <div>
            {selectedOrgData ? (
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Feature Toggles
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{selectedOrgData.name}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Object.entries(featureLabels).map(([key, label]) => {
                    const flags = (selectedOrgData.feature_flags as Record<string, boolean>) || {};
                    return (
                      <div key={key} className="flex items-center justify-between">
                        <Label className="text-sm">{label}</Label>
                        <Switch
                          checked={flags[key] || false}
                          onCheckedChange={() => toggleFeature(selectedOrgData.id, flags, key)}
                        />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ) : (
              <Card className="shadow-card">
                <CardContent className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">Select an organization to manage its features</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Organizations;
