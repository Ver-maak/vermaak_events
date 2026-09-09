import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Copy, Plus, Link2, ExternalLink } from "lucide-react";
import { format } from "date-fns";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);

const PaymentLinks = () => {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("UGX");
  const [amountMode, setAmountMode] = useState<"fixed" | "quantity" | "open">("fixed");
  const [unitAmount, setUnitAmount] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [noteLabel, setNoteLabel] = useState("");
  const [noteRequired, setNoteRequired] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const links = useQuery({
    queryKey: ["payment-links"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_links").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const payments = useQuery({
    queryKey: ["payment-link-payments", selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_link_payments")
        .select("*")
        .eq("link_id", selected!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error("You must be signed in.");
      const finalSlug = slugify(slug || title);
      if (!title.trim()) throw new Error("Enter a title.");
      if (!finalSlug) throw new Error("Enter a valid web address.");
      const unit = Number(unitAmount || 0);
      if (amountMode !== "open" && (!Number.isFinite(unit) || unit <= 0)) throw new Error("Enter a valid amount.");
      const { error } = await supabase.from("payment_links").insert({
        title: title.trim(),
        slug: finalSlug,
        description: description.trim() || null,
        currency,
        amount_mode: amountMode,
        unit_amount: amountMode === "open" ? 0 : unit,
        min_amount: amountMode === "open" && minAmount ? Number(minAmount) : null,
        max_amount: amountMode === "open" && maxAmount ? Number(maxAmount) : null,
        note_label: noteLabel.trim() || null,
        note_required: noteRequired,
        is_active: true,
        created_by: uid,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Payment link created" });
      setOpen(false);
      setTitle(""); setSlug(""); setDescription(""); setUnitAmount(""); setMinAmount(""); setMaxAmount("");
      setNoteLabel(""); setNoteRequired(false); setAmountMode("fixed");
      qc.invalidateQueries({ queryKey: ["payment-links"] });
    },
    onError: (e: Error) => toast({ title: "Could not create link", description: e.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("payment_links").update({ is_active: active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment-links"] }),
  });

  const copy = (s: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/pay/${s}`);
    toast({ title: "Link copied" });
  };

  const paid = (payments.data || []).filter((p: any) => p.status === "paid");
  const collected = paid.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Payment links</h1>
            <p className="text-sm text-muted-foreground">Collect payments from anywhere — no event needed.</p>
          </div>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />New link</Button>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Your links</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {links.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!links.isLoading && (links.data || []).length === 0 && (
              <p className="text-sm text-muted-foreground">No payment links yet.</p>
            )}
            {(links.data || []).map((l: any) => (
              <div key={l.id} className="flex flex-wrap items-center gap-3 border border-border rounded-lg p-3">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 min-w-[200px]">
                  <p className="font-medium text-sm">{l.title}</p>
                  <p className="text-xs text-muted-foreground">
                    /pay/{l.slug} · {l.amount_mode === "open" ? "Payer enters amount" :
                      `${l.currency} ${Number(l.unit_amount).toLocaleString()}${l.amount_mode === "quantity" ? " each" : ""}`}
                  </p>
                </div>
                <Badge variant={l.is_active ? "default" : "secondary"}>{l.is_active ? "Active" : "Off"}</Badge>
                <Switch checked={l.is_active} onCheckedChange={(v) => toggleActive.mutate({ id: l.id, active: v })} />
                <Button variant="outline" size="sm" onClick={() => copy(l.slug)}><Copy className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={`/pay/${l.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
                </Button>
                <Button variant={selected === l.id ? "default" : "ghost"} size="sm" onClick={() => setSelected(selected === l.id ? null : l.id)}>
                  Payments
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {selected && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payments</CardTitle>
              <CardDescription>{paid.length} paid · {collected.toLocaleString()} collected</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3">Reference</th><th className="py-2 pr-3">Payer</th>
                    <th className="py-2 pr-3">Amount</th><th className="py-2 pr-3">Status</th><th className="py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(payments.data || []).map((p: any) => (
                    <tr key={p.id} className="border-b border-border/50">
                      <td className="py-2 pr-3 font-mono text-xs">{p.reference}</td>
                      <td className="py-2 pr-3">{p.payer_name}<br /><span className="text-xs text-muted-foreground">{p.payer_email}</span></td>
                      <td className="py-2 pr-3">{p.currency} {Number(p.amount).toLocaleString()}</td>
                      <td className="py-2 pr-3"><Badge variant={p.status === "paid" ? "default" : "secondary"}>{p.status}</Badge></td>
                      <td className="py-2 text-xs text-muted-foreground">{format(new Date(p.created_at), "dd MMM yyyy HH:mm")}</td>
                    </tr>
                  ))}
                  {(payments.data || []).length === 0 && (
                    <tr><td colSpan={5} className="py-3 text-muted-foreground">No payments yet.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New payment link</DialogTitle>
            <DialogDescription>Share this link anywhere to start collecting payments.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Title</Label><Input value={title} onChange={(e) => { setTitle(e.target.value); if (!slug) setSlug(slugify(e.target.value)); }} /></div>
            <div><Label>Web address</Label><Input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder="my-payment" /></div>
            <div><Label>Description (optional)</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["UGX", "USD", "EUR", "GBP", "KES"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Amount type</Label>
                <Select value={amountMode} onValueChange={(v) => setAmountMode(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed amount</SelectItem>
                    <SelectItem value="quantity">Quantity × price</SelectItem>
                    <SelectItem value="open">Payer enters amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {amountMode !== "open" ? (
              <div><Label>{amountMode === "quantity" ? "Price each" : "Amount"}</Label>
                <Input type="number" value={unitAmount} onChange={(e) => setUnitAmount(e.target.value)} /></div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Minimum (optional)</Label><Input type="number" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} /></div>
                <div><Label>Maximum (optional)</Label><Input type="number" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} /></div>
              </div>
            )}
            <div><Label>Extra question (optional)</Label><Input value={noteLabel} onChange={(e) => setNoteLabel(e.target.value)} placeholder="e.g. Which club are you from?" /></div>
            {noteLabel && (
              <div className="flex items-center gap-2">
                <Switch checked={noteRequired} onCheckedChange={setNoteRequired} />
                <span className="text-sm">Required</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>Create link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default PaymentLinks;
