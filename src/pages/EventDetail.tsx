import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, MapPin, Ticket, Minus, Plus, ArrowLeft } from "lucide-react";
import { formatMoney, formatDateTime } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";
import MoMoPaymentDialog from "@/components/MoMoPaymentDialog";
import AttendeeInfoDialog, { type AttendeeHolder } from "@/components/AttendeeInfoDialog";

const EventDetail = () => {
  const { slug } = useParams();
  const { session, profile, user } = useAuth();
  const navigate = useNavigate();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [buyerName, setBuyerName] = useState(profile?.full_name || "");
  const [buyerEmail, setBuyerEmail] = useState(profile?.email || "");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [momoOpen, setMomoOpen] = useState(false);
  const [attendeeOpen, setAttendeeOpen] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);

  const { data: event, isLoading } = useQuery({
    queryKey: ["event", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data } = await supabase.from("events").select("*").eq("slug", slug!).maybeSingle();
      return data;
    },
  });

  const { data: tiers } = useQuery({
    queryKey: ["tiers", event?.id],
    enabled: !!event?.id,
    queryFn: async () => {
      const { data } = await supabase.from("ticket_tiers").select("*").eq("event_id", event!.id).eq("is_active", true).order("sort_order");
      return data || [];
    },
  });

  const { data: organization } = useQuery({
    queryKey: ["org", event?.organization_id],
    enabled: !!event?.organization_id,
    queryFn: async () => {
      const { data } = await supabase.from("organizations").select("id,name,slug").eq("id", event!.organization_id!).maybeSingle();
      return data;
    },
  });
  const isRotaract = !!(organization && (
    organization.slug?.toLowerCase().includes("rotaract") ||
    organization.name?.toLowerCase().includes("rotaract")
  ));

  const setQty = (tierId: string, q: number) => setQuantities((p) => ({ ...p, [tierId]: Math.max(0, q) }));

  const total = (tiers || []).reduce((s, t) => s + (quantities[t.id] || 0) * Number(t.price), 0);
  const totalQty = Object.values(quantities).reduce((s, n) => s + n, 0);

  // Fetch processing-fee quote from the platform fee engine (tenant-aware).
  const { data: feeQuoteRaw } = useQuery({
    queryKey: ["fee-quote", event?.id, total],
    enabled: !!event?.id && total > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("quote_event_fee", { _event_id: event!.id, _amount: total });
      if (error) throw error;
      return data as { subtotal: number; fee: number; grand_total: number; currency: string; tier_label: string };
    },
  });
  const feeQuote = feeQuoteRaw
    ? {
        subtotal: Number(feeQuoteRaw.subtotal),
        fee: Number(feeQuoteRaw.fee),
        grandTotal: Number(feeQuoteRaw.grand_total),
        currency: feeQuoteRaw.currency,
        tierLabel: feeQuoteRaw.tier_label,
      }
    : null;

  const checkout = useMutation({
    mutationFn: async () => {
      if (!session) { navigate("/auth"); throw new Error("Sign in first"); }
      if (totalQty < 1) throw new Error("Select at least one ticket");
      if (!buyerName || !buyerEmail) throw new Error("Name and email required");
      const items = Object.entries(quantities)
        .filter(([, q]) => q > 0)
        .map(([tier_id, quantity]) => ({ tier_id, quantity, holder_name: buyerName }));

      const { data: orderId, error } = await supabase.rpc("create_ticket_order", {
        _event_id: event!.id, _buyer_name: buyerName, _buyer_email: buyerEmail, _buyer_phone: buyerPhone, _items: items as any,
      });
      if (error) throw error;
      return orderId as string;
    },
    onSuccess: (orderId) => {
      if (total === 0) {
        toast({ title: "Tickets confirmed!", description: "Free order processed." });
        navigate(`/dashboard/orders/${orderId}`);
      } else {
        setPendingOrderId(orderId);
        setMomoOpen(true);
      }
    },
    onError: (e: any) => toast({ title: "Checkout failed", description: e.message, variant: "destructive" }),
  });

  // Rotaract checkout: capture per-ticket attendee info, then create order via v2 RPC.
  const submitAttendeeOrder = async ({ items, buyer_name, buyer_email }: {
    items: { tier_id: string; holders: AttendeeHolder[] }[];
    buyer_name: string; buyer_email: string;
  }) => {
    if (!session) { navigate("/auth"); return; }
    const finalBuyerName = buyerName?.trim() || buyer_name;
    const finalBuyerEmail = buyerEmail?.trim() || buyer_email;
    const { data: orderId, error } = await supabase.rpc("create_ticket_order_v2", {
      _event_id: event!.id,
      _buyer_name: finalBuyerName,
      _buyer_email: finalBuyerEmail,
      _buyer_phone: buyerPhone,
      _items: items as any,
    });
    if (error) throw error;
    setAttendeeOpen(false);
    if (total === 0) {
      toast({ title: "Tickets confirmed!", description: "Free order processed." });
      navigate(`/dashboard/orders/${orderId}`);
    } else {
      setPendingOrderId(orderId as string);
      setMomoOpen(true);
    }
  };

  const startCheckout = () => {
    if (!session) { navigate("/auth"); return; }
    if (totalQty < 1) return;
    if (!buyerName || !buyerEmail) {
      toast({ title: "Missing info", description: "Name and email required", variant: "destructive" });
      return;
    }
    if (isRotaract) setAttendeeOpen(true);
    else checkout.mutate();
  };

  const handleMomoConfirm = async ({ method, phone }: { method: string; phone: string; reference: string }) => {
    if (!pendingOrderId) throw new Error("No pending order");
    // 1. Create payment intent (provider_ref tracked server-side)
    const { data: init, error: initErr } = await supabase.functions.invoke("momo-initiate", {
      body: { order_id: pendingOrderId, provider: method, phone },
    });
    if (initErr || init?.error) throw new Error(init?.error || initErr?.message || "Failed to initiate");
    // 2. Trigger simulated provider callback that hits our signed webhook
    const { data: sim, error: simErr } = await supabase.functions.invoke("momo-simulate", {
      body: { provider_ref: init.provider_ref, provider: method, outcome: "success" },
    });
    if (simErr || !sim?.ok) throw new Error(sim?.data?.error || simErr?.message || "Webhook failed");
    toast({ title: "Payment confirmed!", description: "Your tickets are ready." });
    setTimeout(() => navigate(`/dashboard/orders/${pendingOrderId}`), 600);
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Loading…</div></div>;
  if (!event) return <div className="min-h-screen flex items-center justify-center flex-col gap-4"><p>Event not found</p><Link to="/events"><Button>Browse events</Button></Link></div>;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6">
        <Link to="/events" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"><ArrowLeft className="h-4 w-4" />Back to events</Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="aspect-[16/9] rounded-xl overflow-hidden bg-muted">
              {event.cover_image_url ? <img src={event.cover_image_url} alt={event.title} className="w-full h-full object-cover" />
                : <div className="w-full h-full gradient-accent flex items-center justify-center"><Calendar className="h-16 w-16 text-white/60" /></div>}
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-3">{event.title}</h1>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
                <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" />{formatDateTime(event.starts_at)}</span>
                <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{event.venue || event.city || "TBA"}</span>
              </div>
              {event.description && <p className="text-foreground/80 whitespace-pre-line leading-relaxed">{event.description}</p>}
            </div>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-lg">Get tickets</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {!tiers || tiers.length === 0 ? <p className="text-sm text-muted-foreground">No tickets available</p> :
                  tiers.map((t) => {
                    const remaining = t.quantity ? t.quantity - (t.sold || 0) : null;
                    const soldOut = remaining !== null && remaining <= 0;
                    return (
                      <div key={t.id} className="border border-border rounded-lg p-3">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <p className="font-medium">{t.name}</p>
                            {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                          </div>
                          <p className="font-semibold text-sm whitespace-nowrap">{Number(t.price) === 0 ? "Free" : formatMoney(Number(t.price), t.currency)}</p>
                        </div>
                        {soldOut ? <p className="text-xs text-destructive">Sold out</p> : (
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">{remaining !== null ? `${remaining} left` : "Available"}</p>
                            <div className="flex items-center gap-2">
                              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(t.id, (quantities[t.id] || 0) - 1)}><Minus className="h-3 w-3" /></Button>
                              <span className="w-6 text-center text-sm">{quantities[t.id] || 0}</span>
                              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(t.id, (quantities[t.id] || 0) + 1)}><Plus className="h-3 w-3" /></Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                {totalQty > 0 && (
                  <div className="border-t border-border pt-3 space-y-3">
                    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Tickets subtotal</span>
                        <span className="font-medium">{formatMoney(total, event.currency)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          Processing fee
                          {feeQuote?.tierLabel && total > 0 && (
                            <span className="block text-[10px] opacity-70">{feeQuote.tierLabel}</span>
                          )}
                        </span>
                        <span className="font-medium">
                          {total === 0
                            ? formatMoney(0, event.currency)
                            : feeQuote
                              ? formatMoney(feeQuote.fee, event.currency)
                              : "—"}
                        </span>
                      </div>
                      <div className="h-px bg-border my-1" />
                      <div className="flex justify-between">
                        <span className="font-semibold">Total to pay</span>
                        <span className="font-bold text-primary">
                          {total === 0
                            ? formatMoney(0, event.currency)
                            : feeQuote
                              ? formatMoney(feeQuote.grandTotal, event.currency)
                              : formatMoney(total, event.currency)}
                        </span>
                      </div>
                      {total > 0 && (
                        <p className="text-[10px] text-muted-foreground pt-1">
                          Fee determined by EnventSuite's tenant fee schedule. This is the exact amount charged to your mobile money wallet.
                        </p>
                      )}
                    </div>

                    {!session ? (
                      <Button className="w-full" onClick={() => navigate("/auth")}>Sign in to checkout</Button>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label className="text-xs">Full name</Label>
                          <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Jane Doe" />
                          <Label className="text-xs">Email</Label>
                          <Input type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} placeholder="you@example.com" />
                          <Label className="text-xs">Phone (optional)</Label>
                          <Input value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="+256 …" />
                        </div>
                        <Button
                          className="w-full gap-2"
                          onClick={startCheckout}
                          disabled={checkout.isPending || (total > 0 && !feeQuote)}
                        >
                          <Ticket className="h-4 w-4" />
                          {checkout.isPending
                            ? "Processing…"
                            : total === 0
                              ? "Get tickets"
                              : isRotaract
                                ? "Continue — attendee details"
                                : `Pay ${formatMoney(feeQuote ? feeQuote.grandTotal : total, event.currency)} with Mobile Money`}
                        </Button>
                        <p className="text-[10px] text-muted-foreground text-center">
                          {isRotaract ? "We'll ask for each attendee's club & member info next." : "Pay with MTN MoMo or Airtel Money."}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <AttendeeInfoDialog
        open={attendeeOpen}
        onOpenChange={setAttendeeOpen}
        defaultBuyerName={buyerName}
        defaultBuyerEmail={buyerEmail}
        lines={(tiers || [])
          .filter((t) => (quantities[t.id] || 0) > 0)
          .map((t) => ({ tier_id: t.id, tier_name: t.name, quantity: quantities[t.id] || 0 }))}
        onSubmit={submitAttendeeOrder}
      />

      <MoMoPaymentDialog
        open={momoOpen}
        onOpenChange={setMomoOpen}
        amount={total}
        currency={event.currency}
        defaultPhone={buyerPhone}
        feeQuote={feeQuote}
        onConfirm={handleMomoConfirm}
      />
    </div>
  );
};

export default EventDetail;
