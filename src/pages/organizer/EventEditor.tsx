import { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Save, Send, Plus, Trash2, ExternalLink, Users, BarChart3 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { slugify, formatMoney, formatDateTime } from "@/lib/format";

const EventEditor = () => {
  const { id } = useParams();
  const isNew = id === "new";
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    title: "", description: "", venue: "", city: "", category: "",
    cover_image_url: "", starts_at: "", ends_at: "", currency: "UGX", capacity: "",
    status: "draft" as "draft" | "published" | "cancelled" | "completed",
  });

  const { data: event } = useQuery({
    queryKey: ["event-edit", id],
    enabled: !isNew && !!id,
    queryFn: async () => {
      const { data } = await supabase.from("events").select("*").eq("id", id!).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (event) {
      setForm({
        title: event.title || "", description: event.description || "",
        venue: event.venue || "", city: event.city || "", category: event.category || "",
        cover_image_url: event.cover_image_url || "",
        starts_at: event.starts_at ? new Date(event.starts_at).toISOString().slice(0, 16) : "",
        ends_at: event.ends_at ? new Date(event.ends_at).toISOString().slice(0, 16) : "",
        currency: event.currency || "UGX",
        capacity: event.capacity ? String(event.capacity) : "",
        status: event.status as any,
      });
    }
  }, [event]);

  const ensureOrganizer = async () => {
    if (!user) return;
    await supabase.from("user_roles").insert({ user_id: user.id, role: "organizer" as any }).then(() => {});
  };

  const save = useMutation({
    mutationFn: async (publish?: boolean) => {
      if (!user) throw new Error("Not signed in");
      if (!form.title || !form.starts_at) throw new Error("Title and start date required");
      await ensureOrganizer();
      const payload: any = {
        organizer_id: user.id,
        title: form.title, description: form.description || null,
        venue: form.venue || null, city: form.city || null, category: form.category || null,
        cover_image_url: form.cover_image_url || null,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        currency: form.currency,
        capacity: form.capacity ? Number(form.capacity) : null,
        status: publish ? "published" : form.status,
      };
      if (isNew) {
        payload.slug = slugify(form.title);
        const { data, error } = await supabase.from("events").insert(payload).select().single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase.from("events").update(payload).eq("id", id!).select().single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: (data) => {
      toast({ title: "Saved", description: form.title });
      qc.invalidateQueries({ queryKey: ["organizer-events"] });
      qc.invalidateQueries({ queryKey: ["event-edit"] });
      if (isNew) navigate(`/dashboard/events/${data.id}`);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const setStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from("events").update({ status }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: (_d, status) => {
      toast({ title: `Event ${status}` });
      qc.invalidateQueries({ queryKey: ["event-edit", id] });
      setForm((f) => ({ ...f, status: status as typeof f.status }));
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Link to="/dashboard/events" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />All events</Link>
          {!isNew && event?.status === "published" && (
            <Link to={`/events/${event.slug}`} target="_blank"><Button variant="outline" size="sm" className="gap-1"><ExternalLink className="h-3.5 w-3.5" />View public page</Button></Link>
          )}
        </div>

        <div>
          <h1 className="text-2xl font-bold">{isNew ? "Create event" : form.title}</h1>
          {!isNew && <p className="text-sm text-muted-foreground capitalize">Status: <span className="font-medium">{form.status}</span></p>}
        </div>

        <Tabs defaultValue="details">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="tiers" disabled={isNew}>Tickets</TabsTrigger>
            <TabsTrigger value="attendees" disabled={isNew}>Attendees</TabsTrigger>
            <TabsTrigger value="analytics" disabled={isNew}>Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-6 pt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Event details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Title *</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Afrobeats Festival 2026" />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Tell people what to expect…" />
                </div>
                <div className="space-y-2">
                  <Label>Cover image URL</Label>
                  <Input value={form.cover_image_url} onChange={(e) => setForm({ ...form, cover_image_url: e.target.value })} placeholder="https://…" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Venue</Label><Input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="Kampala Serena Hotel" /></div>
                  <div className="space-y-2"><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Kampala" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Starts at *</Label><Input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Ends at</Label><Input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2"><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Music" /></div>
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["UGX", "USD", "EUR", "KES"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Capacity</Label><Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} placeholder="500" /></div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={() => save.mutate(undefined)} disabled={save.isPending} className="gap-2"><Save className="h-4 w-4" />Save draft</Button>
              {!isNew && form.status === "draft" && (
                <Button variant="default" onClick={() => save.mutate(true)} disabled={save.isPending} className="gap-2 bg-success hover:bg-success/90 text-success-foreground"><Send className="h-4 w-4" />Save & publish</Button>
              )}
              {!isNew && form.status === "published" && (
                <Button variant="outline" onClick={() => setStatus.mutate("draft")}>Unpublish</Button>
              )}
            </div>
          </TabsContent>

          <TabsContent value="tiers" className="pt-4"><TiersPanel eventId={id!} currency={form.currency} /></TabsContent>
          <TabsContent value="attendees" className="pt-4"><AttendeesPanel eventId={id!} /></TabsContent>
          <TabsContent value="analytics" className="pt-4"><AnalyticsPanel eventId={id!} currency={form.currency} /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

const TiersPanel = ({ eventId, currency }: { eventId: string; currency: string }) => {
  const qc = useQueryClient();
  const [draft, setDraft] = useState({ name: "", price: "0", quantity: "", description: "" });
  const { data: tiers } = useQuery({
    queryKey: ["tiers-edit", eventId],
    queryFn: async () => {
      const { data } = await supabase.from("ticket_tiers").select("*").eq("event_id", eventId).order("sort_order");
      return data || [];
    },
  });
  const add = useMutation({
    mutationFn: async () => {
      if (!draft.name) throw new Error("Name required");
      const { error } = await supabase.from("ticket_tiers").insert({
        event_id: eventId, name: draft.name, description: draft.description || null,
        price: Number(draft.price) || 0, currency: currency as any,
        quantity: draft.quantity ? Number(draft.quantity) : null,
        sort_order: tiers?.length || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => { setDraft({ name: "", price: "0", quantity: "", description: "" }); qc.invalidateQueries({ queryKey: ["tiers-edit", eventId] }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const del = useMutation({
    mutationFn: async (tid: string) => { const { error } = await supabase.from("ticket_tiers").delete().eq("id", tid); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tiers-edit", eventId] }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Ticket tiers</CardTitle></CardHeader>
        <CardContent>
          {!tiers || tiers.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">No tiers yet — add one below</p> :
            <div className="space-y-2">
              {tiers.map((t) => (
                <div key={t.id} className="flex items-center justify-between border border-border rounded-lg p-3">
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{Number(t.price) === 0 ? "Free" : formatMoney(Number(t.price), t.currency)} • {t.sold || 0}/{t.quantity ?? "∞"} sold</p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => del.mutate(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              ))}
            </div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Add tier</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Early Bird" /></div>
            <div className="space-y-1.5"><Label>Price ({currency})</Label><Input type="number" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Quantity (blank = unlimited)</Label><Input type="number" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Description</Label><Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="optional" /></div>
          </div>
          <Button onClick={() => add.mutate()} disabled={add.isPending} className="gap-2"><Plus className="h-4 w-4" />Add tier</Button>
        </CardContent>
      </Card>
    </div>
  );
};

const AttendeesPanel = ({ eventId }: { eventId: string }) => {
  const { data: tickets } = useQuery({
    queryKey: ["event-attendees", eventId],
    queryFn: async () => {
      const { data } = await supabase.from("tickets").select("*,orders(buyer_email,status,total_amount,currency,reference),ticket_tiers(name)").eq("event_id", eventId).order("created_at", { ascending: false });
      return data || [];
    },
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" />Attendees ({tickets?.length || 0})</CardTitle>
      </CardHeader>
      <CardContent>
        {!tickets || tickets.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No attendees yet</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground text-xs uppercase">
                <tr><th className="py-2">Holder</th><th>Email</th><th>Tier</th><th>Code</th><th>Order</th><th>Check-in</th></tr>
              </thead>
              <tbody>
                {tickets.map((t: any) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="py-2 font-medium">{t.holder_name}</td>
                    <td className="text-muted-foreground">{t.orders?.buyer_email}</td>
                    <td>{t.ticket_tiers?.name || "—"}</td>
                    <td className="font-mono text-xs">{t.code}</td>
                    <td className="text-xs"><span className={`capitalize ${t.orders?.status === "paid" ? "text-success" : "text-warning"}`}>{t.orders?.status}</span></td>
                    <td>{t.checked_in_at ? <span className="text-success text-xs">{formatDateTime(t.checked_in_at)}</span> : <span className="text-muted-foreground text-xs">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const AnalyticsPanel = ({ eventId, currency }: { eventId: string; currency: string }) => {
  const { data } = useQuery({
    queryKey: ["event-analytics", eventId],
    queryFn: async () => {
      const [{ data: orders }, { data: tickets }] = await Promise.all([
        supabase.from("orders").select("total_amount,status,created_at").eq("event_id", eventId),
        supabase.from("tickets").select("id,checked_in_at,tier_id,ticket_tiers(name)").eq("event_id", eventId),
      ]);
      const paid = (orders || []).filter((o) => o.status === "paid");
      const revenue = paid.reduce((s, o) => s + Number(o.total_amount || 0), 0);
      const checkedIn = (tickets || []).filter((t) => t.checked_in_at).length;
      const byTier: Record<string, number> = {};
      (tickets || []).forEach((t: any) => { const n = t.ticket_tiers?.name || "Untiered"; byTier[n] = (byTier[n] || 0) + 1; });
      return { revenue, ordersCount: orders?.length || 0, paidCount: paid.length, ticketsTotal: tickets?.length || 0, checkedIn, byTier };
    },
  });

  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Revenue</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{formatMoney(data.revenue, currency)}</p><p className="text-xs text-muted-foreground">{data.paidCount}/{data.ordersCount} orders paid</p></CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Tickets</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{data.ticketsTotal}</p><p className="text-xs text-muted-foreground">{data.checkedIn} checked in</p></CardContent></Card>
      <Card className="md:col-span-2"><CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" />Sales by tier</CardTitle></CardHeader><CardContent className="space-y-2">
        {Object.entries(data.byTier).length === 0 ? <p className="text-sm text-muted-foreground">No sales yet</p> :
          Object.entries(data.byTier).map(([n, c]) => {
            const max = Math.max(...Object.values(data.byTier));
            return (
              <div key={n}>
                <div className="flex justify-between text-sm mb-1"><span>{n}</span><span className="font-medium">{c}</span></div>
                <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full gradient-primary" style={{ width: `${(c / max) * 100}%` }} /></div>
              </div>
            );
          })}
      </CardContent></Card>
    </div>
  );
};

export default EventEditor;
