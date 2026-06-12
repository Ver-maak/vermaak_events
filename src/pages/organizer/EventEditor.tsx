import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Save, Send, Plus, Trash2, ExternalLink, Users, BarChart3, Upload, X, ImageIcon, Loader2, ShieldCheck, UserPlus, Mail } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { slugify, formatMoney, formatDateTime } from "@/lib/format";

// Convert an ISO/UTC timestamp into the "YYYY-MM-DDTHH:mm" string that
// <input type="datetime-local"> expects, expressed in the user's LOCAL timezone.
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const EventEditor = () => {
  const { id } = useParams();
  const isNew = id === "new";
  const { user, roles } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
        starts_at: event.starts_at ? toLocalInput(event.starts_at) : "",
        ends_at: event.ends_at ? toLocalInput(event.ends_at) : "",
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

  type EventStatus = "draft" | "published" | "cancelled" | "completed";
  const setStatus = useMutation({
    mutationFn: async (status: EventStatus) => {
      const { error } = await supabase.from("events").update({ status }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: (_d, status) => {
      toast({ title: `Event ${status}` });
      qc.invalidateQueries({ queryKey: ["event-edit", id] });
      setForm((f) => ({ ...f, status }));
    },
  });

  const [confirmText, setConfirmText] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const del = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Missing event");
      // Order matters: remove children before parent (FKs may not cascade).
      const { data: orderIds } = await supabase.from("orders").select("id").eq("event_id", id);
      const ids = (orderIds || []).map((o: any) => o.id);
      if (ids.length) {
        const { error: piErr } = await supabase.from("payment_intents").delete().in("order_id", ids);
        if (piErr) throw piErr;
      }
      const { error: tErr } = await supabase.from("tickets").delete().eq("event_id", id);
      if (tErr) throw tErr;
      const { error: oErr } = await supabase.from("orders").delete().eq("event_id", id);
      if (oErr) throw oErr;
      const { error: trErr } = await supabase.from("ticket_tiers").delete().eq("event_id", id);
      if (trErr) throw trErr;
      const { error: eErr } = await supabase.from("events").delete().eq("id", id);
      if (eErr) throw eErr;
    },
    onSuccess: () => {
      toast({ title: "Event deleted", description: "The event and all related data have been removed." });
      qc.invalidateQueries({ queryKey: ["organizer-events"] });
      setDeleteOpen(false);
      navigate("/dashboard/events");
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
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

        {(() => {
          const isOwner = !!event && !!user && event.organizer_id === user.id;
          const canManage = isNew || isOwner || isSuperAdmin;
          const initialTab = (searchParams.get("tab") === "admins" && canManage && !isNew) ? "admins" : "details";
          return (
        <Tabs defaultValue={initialTab}>
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="tiers" disabled={isNew}>Tickets</TabsTrigger>
            <TabsTrigger value="attendees" disabled={isNew}>Attendees</TabsTrigger>
            <TabsTrigger value="analytics" disabled={isNew}>Analytics</TabsTrigger>
            {canManage && !isNew && <TabsTrigger value="admins">Admins</TabsTrigger>}
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
                  <Label>Cover image</Label>
                  <CoverImageUploader
                    value={form.cover_image_url}
                    onChange={(url) => setForm({ ...form, cover_image_url: url })}
                    userId={user?.id}
                  />
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
              {!isNew && (
                <AlertDialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setConfirmText(""); }}>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="gap-2 ml-auto"><Trash2 className="h-4 w-4" />Delete event</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                        <Trash2 className="h-5 w-5" /> Permanently delete this event?
                      </AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="space-y-3 pt-1">
                          <p>
                            This will <strong>permanently delete</strong> <span className="font-semibold text-foreground">"{form.title}"</span> along with:
                          </p>
                          <ul className="list-disc pl-5 text-sm space-y-1">
                            <li>All ticket tiers</li>
                            <li>All orders and payment intents</li>
                            <li>All issued tickets and check-in history</li>
                          </ul>
                          <p className="text-destructive font-medium">
                            This action cannot be undone.
                          </p>
                          <div className="space-y-1.5 pt-1">
                            <Label htmlFor="confirm-delete" className="text-xs">
                              Type <code className="px-1 py-0.5 rounded bg-muted text-foreground">DELETE</code> to confirm
                            </Label>
                            <Input
                              id="confirm-delete"
                              value={confirmText}
                              onChange={(e) => setConfirmText(e.target.value)}
                              placeholder="DELETE"
                              autoComplete="off"
                            />
                          </div>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={confirmText !== "DELETE" || del.isPending}
                        onClick={(e) => { e.preventDefault(); del.mutate(); }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {del.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting…</> : "Delete event"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </TabsContent>

          <TabsContent value="tiers" className="pt-4"><TiersPanel eventId={id!} currency={form.currency} /></TabsContent>
          <TabsContent value="attendees" className="pt-4"><AttendeesPanel eventId={id!} /></TabsContent>
          <TabsContent value="analytics" className="pt-4"><AnalyticsPanel eventId={id!} currency={form.currency} /></TabsContent>
          {canManage && !isNew && <TabsContent value="admins" className="pt-4"><AdminsPanel eventId={id!} /></TabsContent>}
        </Tabs>
          );
        })()}
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

const COVER_BUCKET = "event-covers";
const SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 10; // ~10 years

const CoverImageUploader = ({
  value,
  onChange,
  userId,
}: {
  value: string;
  onChange: (url: string) => void;
  userId?: string;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const openFile = () => inputRef.current?.click();

  const handleFile = async (file: File) => {
    if (!userId) {
      toast({ title: "Sign in required", description: "Please sign in to upload images.", variant: "destructive" });
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please choose an image (PNG, JPG, WebP).", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Cover image must be under 10MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from(COVER_BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage
        .from(COVER_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL);
      if (sErr) throw sErr;
      onChange(signed.signedUrl);
      toast({ title: "Cover image uploaded" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      {value ? (
        <div className="relative group rounded-lg overflow-hidden border border-border bg-muted">
          <img src={value} alt="Cover preview" className="w-full max-h-[480px] object-contain bg-muted" />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-2 right-2 h-8 w-8 rounded-full bg-background/90 hover:bg-background flex items-center justify-center shadow-md transition"
            aria-label="Remove cover image"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={openFile}
          disabled={uploading}
          className="w-full aspect-video rounded-lg border-2 border-dashed border-border bg-muted/40 hover:bg-muted/70 hover:border-primary/50 transition flex flex-col items-center justify-center gap-2 text-muted-foreground"
        >
          {uploading ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-sm">Uploading…</span>
            </>
          ) : (
            <>
              <ImageIcon className="h-8 w-8" />
              <span className="text-sm font-medium">Click to upload a cover image</span>
              <span className="text-xs">PNG, JPG or WebP up to 10MB — uploaded as-is</span>
            </>
          )}
        </button>
      )}

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={openFile} disabled={uploading} className="gap-2">
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {value ? "Replace image" : "Upload image"}
        </Button>
        <span className="text-xs text-muted-foreground">or paste a URL</span>
      </div>

      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://…" />

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
};

const MAX_EVENT_ADMINS = 4;

const AdminsPanel = ({ eventId }: { eventId: string }) => {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");

  const { data: admins, isLoading } = useQuery({
    queryKey: ["event-admins", eventId],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("event_admins")
        .select("id,user_id,invited_email,created_at,granted_by")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true });
      const ids = (rows || []).map((r: any) => r.user_id);
      let profiles: any[] = [];
      if (ids.length) {
        const { data: ps } = await supabase
          .from("profiles")
          .select("id,full_name,email")
          .in("id", ids);
        profiles = ps || [];
      }
      return (rows || []).map((r: any) => ({
        ...r,
        profile: profiles.find((p) => p.id === r.user_id),
      }));
    },
  });

  const invite = useMutation({
    mutationFn: async () => {
      if (!email.trim()) throw new Error("Email required");
      const { data, error } = await supabase.rpc("invite_event_admin", {
        _event_id: eventId,
        _email: email.trim(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (res: any) => {
      const pending = res?.status === "pending";
      toast({
        title: pending ? "Invite saved" : "Event admin added",
        description: pending
          ? `${email} doesn't have an EventSuite account yet — they'll get access automatically once they sign up with this email.`
          : email,
      });
      setEmail("");
      qc.invalidateQueries({ queryKey: ["event-admins", eventId] });
    },
    onError: (e: any) => toast({ title: "Could not add admin", description: e.message, variant: "destructive" }),
  });

  const revoke = useMutation({
    mutationFn: async (rowId: string) => {
      const { error } = await supabase.rpc("revoke_event_admin_row", { _id: rowId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Access revoked" });
      qc.invalidateQueries({ queryKey: ["event-admins", eventId] });
    },
    onError: (e: any) => toast({ title: "Revoke failed", description: e.message, variant: "destructive" }),
  });

  const count = admins?.length || 0;
  const atLimit = count >= MAX_EVENT_ADMINS;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Event admins ({count}/{MAX_EVENT_ADMINS})
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Event admins can view this event's orders, attendees and analytics, and check in tickets — but cannot edit the event, see other events, or export data.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="person@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={atLimit || invite.isPending}
              onKeyDown={(e) => { if (e.key === "Enter") invite.mutate(); }}
            />
            <Button onClick={() => invite.mutate()} disabled={atLimit || invite.isPending || !email.trim()} className="gap-2">
              <UserPlus className="h-4 w-4" />Invite
            </Button>
          </div>
          {atLimit && <p className="text-xs text-warning">Maximum of {MAX_EVENT_ADMINS} admins reached. Revoke one to invite another.</p>}
          <p className="text-xs text-muted-foreground">If they don't have an EventSuite account yet, we'll save the invite and grant access automatically when they sign up with this email.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Current admins</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p> :
            !admins || admins.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No event admins yet</p>
            ) : (
              <div className="space-y-2">
                {admins.map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between border border-border rounded-lg p-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate flex items-center gap-2">
                        {a.profile?.full_name || a.invited_email || "User"}
                        {!a.user_id && (
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-warning/15 text-warning border border-warning/30">
                            Pending signup
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <Mail className="h-3 w-3" />{a.profile?.email || a.invited_email}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => revoke.mutate(a.id)} disabled={revoke.isPending}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EventEditor;
