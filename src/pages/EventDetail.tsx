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

const EventDetail = () => {
  const { slug } = useParams();
  const { session, profile, user } = useAuth();
  const navigate = useNavigate();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [buyerName, setBuyerName] = useState(profile?.full_name || "");
  const [buyerEmail, setBuyerEmail] = useState(profile?.email || "");
  const [buyerPhone, setBuyerPhone] = useState("");

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

  const setQty = (tierId: string, q: number) => setQuantities((p) => ({ ...p, [tierId]: Math.max(0, q) }));

  const total = (tiers || []).reduce((s, t) => s + (quantities[t.id] || 0) * Number(t.price), 0);
  const totalQty = Object.values(quantities).reduce((s, n) => s + n, 0);

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

      // Stub payment for paid orders
      if (total > 0) {
        await supabase.rpc("mark_order_paid", { _order_id: orderId, _method: "stub", _reference: "DEMO-" + Date.now() });
      }
      return orderId as string;
    },
    onSuccess: (orderId) => {
      toast({ title: "Order confirmed!", description: "Your tickets are ready." });
      navigate(`/dashboard/orders/${orderId}`);
    },
    onError: (e: any) => toast({ title: "Checkout failed", description: e.message, variant: "destructive" }),
  });

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
                    <div className="flex justify-between font-semibold"><span>Total</span><span>{formatMoney(total, event.currency)}</span></div>

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
                        <Button className="w-full gap-2" onClick={() => checkout.mutate()} disabled={checkout.isPending}>
                          <Ticket className="h-4 w-4" />{checkout.isPending ? "Processing…" : total === 0 ? "Get tickets" : `Pay ${formatMoney(total, event.currency)}`}
                        </Button>
                        <p className="text-[10px] text-muted-foreground text-center">Demo checkout — no real charge.</p>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventDetail;
