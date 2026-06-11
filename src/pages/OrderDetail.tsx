import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Calendar, MapPin, Trash2, CreditCard } from "lucide-react";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";
import TicketPreviewCard from "@/components/TicketPreviewCard";
import MoMoPaymentDialog from "@/components/MoMoPaymentDialog";
import { getFunctionErrorMessage, extractProviderReason } from "@/lib/paymentErrors";

const OrderDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { roles } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");
  const qc = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [momoOpen, setMomoOpen] = useState(false);
  const [pendingIntentId, setPendingIntentId] = useState<string | null>(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ["order-detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("*,events(title,starts_at,venue,city,cover_image_url),tickets(*,ticket_tiers(name))").eq("id", id!).maybeSingle();
      return data;
    },
  });

  const isPending = order?.status === "pending" && Number(order?.total_amount) > 0;

  const { data: feeQuoteRaw } = useQuery({
    queryKey: ["order-fee", id],
    enabled: !!id && isPending,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("quote_order_fee", { _order_id: id! });
      if (error) throw error;
      return data as any;
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

  const handleDelete = async (ticketId: string) => {
    setDeletingId(ticketId);
    const { error } = await supabase.from("tickets").delete().eq("id", ticketId);
    setDeletingId(null);
    if (error) {
      toast({ title: "Failed to delete ticket", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Ticket deleted" });
    qc.invalidateQueries({ queryKey: ["order-detail", id] });
  };

  const handleMomoConfirm = async ({ phone }: { method: string; phone: string; reference: string }) => {
    if (!order?.id) throw new Error("No order");
    setPendingIntentId(null);
    const { data: init, error: initErr } = await supabase.functions.invoke("payments-initiate", {
      body: { order_id: order.id, provider_code: "swarmbyte", phone },
    });
    if (initErr || init?.error) throw new Error(init?.error || await getFunctionErrorMessage(initErr, "Failed to initiate payment"));

    if (init.already_paid) {
      toast({ title: "Payment confirmed!", description: "Your tickets are ready." });
      qc.invalidateQueries({ queryKey: ["order-detail", id] });
      return;
    }

    if (init.stub) {
      const ref = `STUB-${Date.now()}`;
      const { error: mpErr } = await supabase.rpc("mark_order_paid", {
        _order_id: order.id, _method: "stub", _reference: ref,
      });
      if (mpErr) throw new Error(mpErr.message);
      toast({ title: "Payment confirmed!", description: "Your tickets are ready." });
      qc.invalidateQueries({ queryKey: ["order-detail", id] });
      return;
    }

    if (init.redirect_url) {
      window.location.href = init.redirect_url as string;
      return;
    }

    const intentId = init.intent_id as string;
    setPendingIntentId(intentId);
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      const { data: verified, error: verifyErr } = await supabase.functions.invoke("payments-verify", {
        body: { intent_id: intentId },
      });
      if (verifyErr || verified?.error) throw new Error(verified?.error || await getFunctionErrorMessage(verifyErr, "Verification failed"));
      if (verified?.status === "success") {
        toast({ title: "Payment confirmed!", description: "Your tickets are ready." });
        qc.invalidateQueries({ queryKey: ["order-detail", id] });
        return;
      }
      if (verified?.status === "failed" || verified?.status === "cancelled") {
        const reason = (verified?.result as any)?.error || extractProviderReason(verified?.raw);
        throw new Error(reason ? `Payment ${verified.status}: ${reason}` : `Payment ${verified.status}`);
      }
    }
    throw new Error("Confirmation timed out. Tap 'Check status' if you already approved on your phone.");
  };

  const verifyManually = async (): Promise<"success" | "failed" | "cancelled" | "pending"> => {
    if (!pendingIntentId) return "pending";
    const { data, error } = await supabase.functions.invoke("payments-verify", {
      body: { intent_id: pendingIntentId },
    });
    if (error || data?.error) throw new Error(data?.error || await getFunctionErrorMessage(error, "Verification failed"));
    const status = (data?.status as "success" | "failed" | "cancelled" | "pending") || "pending";
    if (status === "success") {
      qc.invalidateQueries({ queryKey: ["order-detail", id] });
    }
    return status;
  };

  if (isLoading) return <DashboardLayout><p className="text-muted-foreground">Loading…</p></DashboardLayout>;
  if (!order) return <DashboardLayout><p>Order not found</p></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <Link to="/dashboard/my-tickets" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back</Link>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{(order as any).events?.title}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Order {order.reference}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${order.status === "paid" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>{order.status}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-4 w-4" />{formatDateTime((order as any).events?.starts_at)}</div>
            <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" />{(order as any).events?.venue || (order as any).events?.city || "TBA"}</div>
            <div className="pt-2 flex justify-between font-semibold"><span>Total</span><span>{formatMoney(Number(order.total_amount), order.currency)}</span></div>

            {isPending && (
              <div className="pt-3 border-t border-border mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Your order is awaiting payment. Complete it now to receive your tickets.
                </p>
                <Button className="w-full gap-2" onClick={() => setMomoOpen(true)}>
                  <CreditCard className="h-4 w-4" />
                  Complete payment{feeQuote ? ` — ${formatMoney(feeQuote.grandTotal, order.currency)}` : ""}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div>
          <h2 className="text-lg font-semibold mb-3">Your tickets ({(order as any).tickets?.length || 0})</h2>
          <div className="grid grid-cols-1 gap-4">
            {(order as any).tickets?.map((t: any) => (
              <TicketPreviewCard
                key={t.id}
                ticket={t}
                event={(order as any).events}
                order={order}
                actions={isSuperAdmin && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm" className="gap-1" disabled={deletingId === t.id}>
                          <Trash2 className="h-3.5 w-3.5" />Delete ticket
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this ticket?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently removes ticket <span className="font-mono">{t.code}</span> for {t.holder_name}. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(t.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                )}
              />
            ))}
          </div>
        </div>
      </div>

      <MoMoPaymentDialog
        open={momoOpen}
        onOpenChange={setMomoOpen}
        amount={Number(order.total_amount)}
        currency={order.currency}
        defaultPhone={(order as any).buyer_phone || ""}
        feeQuote={feeQuote}
        onConfirm={handleMomoConfirm}
        onManualVerify={verifyManually}
      />
    </DashboardLayout>
  );
};

export default OrderDetail;
