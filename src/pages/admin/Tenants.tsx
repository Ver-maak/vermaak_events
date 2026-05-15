import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Activity, Users, Calendar, DollarSign, TrendingUp, UserPlus, ShieldOff, ShieldCheck, Search } from "lucide-react";
import { formatMoney, formatDateTime } from "@/lib/format";

const Tenants = () => {
  const { roles } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [provision, setProvision] = useState({ org_name: "", admin_name: "", email: "" });
  const [credentials, setCredentials] = useState<{ email: string; password: string; org: string } | null>(null);

  const { data: organizers = [], isLoading } = useQuery({
    enabled: isSuperAdmin,
    queryKey: ["admin-organizers"],
    queryFn: async () => {
      const { data: roleRows } = await supabase.from("user_roles").select("user_id").eq("role", "organizer");
      const ids = (roleRows || []).map((r) => r.user_id);
      if (ids.length === 0) return [];
      const { data: profs } = await supabase.from("profiles").select("*").in("id", ids);
      return profs || [];
    },
  });

  const { data: events = [] } = useQuery({
    enabled: isSuperAdmin,
    queryKey: ["admin-all-events"],
    queryFn: async () => (await supabase.from("events").select("id, title, organizer_id, status, currency, created_at")).data || [],
  });

  const { data: orders = [] } = useQuery({
    enabled: isSuperAdmin,
    queryKey: ["admin-all-orders"],
    queryFn: async () => (await supabase.from("orders").select("id, event_id, total_amount, currency, status, paid_at, created_at, buyer_email, reference").order("created_at", { ascending: false }).limit(500)).data || [],
  });

  const { data: tickets = [] } = useQuery({
    enabled: isSuperAdmin,
    queryKey: ["admin-all-tickets-count"],
    queryFn: async () => (await supabase.from("tickets").select("id, event_id, checked_in_at, created_at")).data || [],
  });

  // Compute per-organizer metrics
  const orgMetrics = useMemo(() => {
    const eventsByOrganizer: Record<string, typeof events> = {};
    for (const e of events) (eventsByOrganizer[e.organizer_id] ||= []).push(e);
    const eventIdToOrg: Record<string, string> = {};
    for (const e of events) eventIdToOrg[e.id] = e.organizer_id;
    const ticketsByOrg: Record<string, number> = {};
    for (const t of tickets) {
      const o = eventIdToOrg[t.event_id]; if (!o) continue;
      ticketsByOrg[o] = (ticketsByOrg[o] || 0) + 1;
    }
    const revenueByOrg: Record<string, number> = {};
    const lastActivity: Record<string, string> = {};
    for (const o of orders) {
      const oid = eventIdToOrg[o.event_id]; if (!oid) continue;
      if (o.status === "paid") revenueByOrg[oid] = (revenueByOrg[oid] || 0) + Number(o.total_amount || 0);
      if (!lastActivity[oid] || lastActivity[oid] < o.created_at) lastActivity[oid] = o.created_at;
    }
    return { eventsByOrganizer, ticketsByOrg, revenueByOrg, lastActivity };
  }, [events, orders, tickets]);

  // Platform KPIs
  const kpis = useMemo(() => {
    const paid = orders.filter((o) => o.status === "paid");
    const gmv = paid.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const activeOrganizers = organizers.filter((p: any) => p.status !== "suspended").length;
    return {
      organizers: organizers.length,
      activeOrganizers,
      events: events.length,
      published: events.filter((e) => e.status === "published").length,
      orders: orders.length,
      paidOrders: paid.length,
      gmv,
      tickets: tickets.length,
      checkedIn: tickets.filter((t) => t.checked_in_at).length,
    };
  }, [organizers, events, orders, tickets]);

  const filteredOrganizers = useMemo(() => {
    const s = search.toLowerCase();
    if (!s) return organizers;
    return organizers.filter((o: any) =>
      (o.full_name || "").toLowerCase().includes(s) ||
      (o.email || "").toLowerCase().includes(s)
    );
  }, [organizers, search]);

  const suspendMutation = useMutation({
    mutationFn: async ({ id, suspend }: { id: string; suspend: boolean }) => {
      const { error } = await supabase.from("profiles").update({ status: suspend ? "suspended" : "active" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["admin-organizers"] });
      toast({ title: v.suspend ? "Organizer suspended" : "Organizer reactivated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const promoteMutation = useMutation({
    mutationFn: async (email: string) => {
      const { data: profs, error: pErr } = await supabase.from("profiles").select("id, email").eq("email", email).maybeSingle();
      if (pErr) throw pErr;
      if (!profs) throw new Error("No user with that email. Ask them to sign up first.");
      const { error } = await supabase.from("user_roles").insert({ user_id: profs.id, role: "organizer" });
      if (error && !error.message.includes("duplicate")) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-organizers"] });
      setCreateOpen(false); setNewEmail("");
      toast({ title: "Organizer added" });
    },
    onError: (e: any) => toast({ title: "Couldn't promote user", description: e.message, variant: "destructive" }),
  });

  // Activity feed: combine recent orders + check-ins
  const activity = useMemo(() => {
    const items: { id: string; ts: string; kind: string; text: string }[] = [];
    for (const o of orders.slice(0, 50)) {
      const ev = events.find((e) => e.id === o.event_id);
      items.push({
        id: "o-" + o.id,
        ts: o.created_at,
        kind: o.status === "paid" ? "order_paid" : "order_pending",
        text: `${o.buyer_email} ${o.status === "paid" ? "paid" : "started"} ${formatMoney(Number(o.total_amount || 0), o.currency)} for ${ev?.title || "event"}`,
      });
    }
    for (const t of tickets.filter((x) => x.checked_in_at).slice(0, 50)) {
      const ev = events.find((e) => e.id === t.event_id);
      items.push({
        id: "t-" + t.id,
        ts: t.checked_in_at!,
        kind: "checkin",
        text: `Ticket checked in at ${ev?.title || "event"}`,
      });
    }
    return items.sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 30);
  }, [orders, events, tickets]);

  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Tenant Dashboard</h1>
            <p className="text-muted-foreground text-sm">Monitor organizers, track platform health, and manage sub-accounts.</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><UserPlus className="h-4 w-4" />Promote organizer</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add organizer</DialogTitle>
                <DialogDescription>Grant organizer permissions to an existing user account.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label>User email</Label>
                <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="organizer@example.com" />
                <p className="text-xs text-muted-foreground">User must already have signed up.</p>
              </div>
              <DialogFooter>
                <Button onClick={() => promoteMutation.mutate(newEmail)} disabled={!newEmail || promoteMutation.isPending}>
                  {promoteMutation.isPending ? "Adding…" : "Add organizer"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI icon={<Users className="h-4 w-4" />} label="Organizers" value={`${kpis.activeOrganizers}/${kpis.organizers}`} hint="active / total" />
          <KPI icon={<Calendar className="h-4 w-4" />} label="Events" value={`${kpis.published}/${kpis.events}`} hint="published / total" />
          <KPI icon={<TrendingUp className="h-4 w-4" />} label="Orders" value={`${kpis.paidOrders}/${kpis.orders}`} hint="paid / total" />
          <KPI icon={<DollarSign className="h-4 w-4" />} label="GMV" value={formatMoney(kpis.gmv, "UGX")} hint={`${kpis.tickets} tickets · ${kpis.checkedIn} checked in`} />
        </div>

        <Tabs defaultValue="organizers">
          <TabsList>
            <TabsTrigger value="organizers">Organizers</TabsTrigger>
            <TabsTrigger value="activity">Activity feed</TabsTrigger>
          </TabsList>

          <TabsContent value="organizers" className="space-y-3">
            <div className="relative max-w-sm">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>

            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-6 text-sm text-muted-foreground">Loading organizers…</div>
                ) : filteredOrganizers.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground text-center">No organizers yet. Promote a user to get started.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Organizer</TableHead>
                        <TableHead className="text-right">Events</TableHead>
                        <TableHead className="text-right">Tickets</TableHead>
                        <TableHead className="text-right">Revenue (UGX)</TableHead>
                        <TableHead>Last activity</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrganizers.map((o: any) => {
                        const evCount = (orgMetrics.eventsByOrganizer[o.id] || []).length;
                        const tCount = orgMetrics.ticketsByOrg[o.id] || 0;
                        const rev = orgMetrics.revenueByOrg[o.id] || 0;
                        const last = orgMetrics.lastActivity[o.id];
                        const suspended = o.status === "suspended";
                        return (
                          <TableRow key={o.id}>
                            <TableCell>
                              <div className="font-medium">{o.full_name || "Unnamed"}</div>
                              <div className="text-xs text-muted-foreground">{o.email}</div>
                            </TableCell>
                            <TableCell className="text-right">{evCount}</TableCell>
                            <TableCell className="text-right">{tCount}</TableCell>
                            <TableCell className="text-right">{formatMoney(rev, "UGX")}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{last ? formatDateTime(last) : "—"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={suspended ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-success/10 text-success border-success/20"}>
                                {suspended ? "Suspended" : "Active"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="outline" size="sm" className="gap-1.5"
                                onClick={() => suspendMutation.mutate({ id: o.id, suspend: !suspended })}
                                disabled={suspendMutation.isPending}>
                                {suspended ? <><ShieldCheck className="h-3.5 w-3.5" />Reactivate</> : <><ShieldOff className="h-3.5 w-3.5" />Suspend</>}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" />Recent activity</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {activity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                ) : activity.map((a) => (
                  <div key={a.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                    <div className={`h-2 w-2 rounded-full mt-2 ${a.kind === "order_paid" ? "bg-success" : a.kind === "checkin" ? "bg-primary" : "bg-muted-foreground"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{a.text}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(a.ts)}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

const KPI = ({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="text-primary">{icon}</span>{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </CardContent>
  </Card>
);

export default Tenants;
