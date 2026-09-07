import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { formatMoney, formatDateTime } from "@/lib/format";
import { explainPaymentError, type FriendlyFailure } from "@/lib/paymentErrors";
import { BRAND_LABEL, formatCardNumber, validateCard, type CardBrand } from "@/lib/cardBrand";
import { CheckCircle2, CreditCard, Loader2, Smartphone, XCircle, Download } from "lucide-react";
import jsPDF from "jspdf";

type Stage = "form" | "waiting" | "success" | "failed";

interface Receipt {
  reference: string;
  amount: number;
  currency: string;
  payer_name: string;
  payer_email: string;
  payer_phone?: string | null;
  note?: string | null;
  quantity: number;
  paid_at?: string | null;
  title: string;
}

const normalizePhone = (raw: string) => {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00256")) d = d.slice(2);
  if (d.startsWith("2560")) d = "256" + d.slice(4);
  if (d.startsWith("0")) d = "256" + d.slice(1);
  if (/^7\d{8}$/.test(d)) d = "256" + d;
  return d;
};

const PayLink = () => {
  const { slug } = useParams();
  const [link, setLink] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [openAmount, setOpenAmount] = useState("");
  const [channel, setChannel] = useState<"momo" | "card">("momo");
  const [cardNumber, setCardNumber] = useState("");

  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState("");
  const [failure, setFailure] = useState<FriendlyFailure | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("payment_links").select("*").eq("slug", slug!).maybeSingle();
      setLink(data);
      setLoading(false);
    })();
  }, [slug]);

  const amount = useMemo(() => {
    if (!link) return 0;
    if (link.amount_mode === "quantity") return Number(link.unit_amount) * (quantity || 0);
    if (link.amount_mode === "open") return Number(openAmount || 0);
    return Number(link.unit_amount);
  }, [link, quantity, openAmount]);

  const cardCheck = validateCard(cardNumber);
  const normalizedPhone = normalizePhone(phone);
  const validPhone = /^2567\d{8}$/.test(normalizedPhone);

  const start = async () => {
    setError("");
    setFailure(null);
    if (name.trim().length < 2) return setError("Enter your full name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter a valid email address");
    if (amount <= 0) return setError("Enter a valid amount");
    if (link.note_required && !note.trim()) return setError(`${link.note_label || "Note"} is required`);
    if (channel === "momo" && !validPhone) return setError("Enter a valid Ugandan mobile money number");
    if (channel === "card" && !cardCheck.valid) return setError(cardCheck.error || "Enter a valid card");

    setStage("waiting");
    const { data, error: fnErr } = await supabase.functions.invoke("paylink-initiate", {
      body: {
        slug,
        name: name.trim(),
        email: email.trim(),
        phone: channel === "momo" ? normalizedPhone : phone ? normalizePhone(phone) : undefined,
        amount: link.amount_mode === "open" ? amount : undefined,
        quantity: link.amount_mode === "quantity" ? quantity : undefined,
        note: note.trim() || undefined,
        channel,
        card: channel === "card" ? { brand: cardCheck.brand, last4: cardCheck.last4 } : undefined,
      },
    });
    const res: any = data;
    if (fnErr || !res?.ok) {
      setFailure(explainPaymentError(fnErr?.message || res?.error || "Payment could not be started"));
      setStage("failed");
      return;
    }
    setPaymentId(res.payment_id);
    if (res.redirect_url) {
      window.location.href = res.redirect_url;
      return;
    }
  };

  // Poll while waiting
  useEffect(() => {
    if (stage !== "waiting" || !paymentId) return;
    let stop = false;
    const started = Date.now();
    const tick = async () => {
      if (stop) return;
      const { data } = await supabase.functions.invoke("paylink-status", { body: { payment_id: paymentId } });
      const res: any = data;
      if (res?.ok && res.status === "success") {
        setReceipt(res.receipt);
        setStage("success");
        return;
      }
      if (res?.ok && (res.status === "failed" || res.status === "cancelled")) {
        setFailure(explainPaymentError(`Payment ${res.status}`));
        setStage("failed");
        return;
      }
      if (Date.now() - started > 150_000) {
        setFailure(explainPaymentError("Confirmation timed out"));
        setStage("failed");
        return;
      }
      setTimeout(tick, 5000);
    };
    const t = setTimeout(tick, 5000);
    return () => { stop = true; clearTimeout(t); };
  }, [stage, paymentId]);

  const manualCheck = async () => {
    if (!paymentId) return;
    setChecking(true);
    const { data } = await supabase.functions.invoke("paylink-status", { body: { payment_id: paymentId } });
    const res: any = data;
    setChecking(false);
    if (res?.ok && res.status === "success") { setReceipt(res.receipt); setStage("success"); }
    else if (res?.ok && res.status === "pending") setFailure({ kind: "timeout", title: "Still pending", description: "We haven't received confirmation yet. Approve the prompt, then check again.", retryable: true });
    else setFailure(explainPaymentError(res?.error || `Payment ${res?.status || "failed"}`));
  };

  const downloadReceipt = () => {
    if (!receipt) return;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Payment Receipt", 14, 22);
    doc.setFontSize(11);
    const rows: [string, string][] = [
      ["Reference", receipt.reference],
      ["For", receipt.title],
      ["Amount paid", formatMoney(receipt.amount, receipt.currency)],
      ["Paid on", formatDateTime(receipt.paid_at || new Date().toISOString())],
      ["Name", receipt.payer_name],
      ["Email", receipt.payer_email],
      ...(receipt.payer_phone ? ([["Phone", receipt.payer_phone]] as [string, string][]) : []),
      ...(receipt.quantity > 1 ? ([["Quantity", String(receipt.quantity)]] as [string, string][]) : []),
      ...(receipt.note ? ([["Note", receipt.note]] as [string, string][]) : []),
    ];
    let y = 36;
    rows.forEach(([k, v]) => {
      doc.setTextColor(120);
      doc.text(k, 14, y);
      doc.setTextColor(20);
      doc.text(String(v), 70, y);
      y += 9;
    });
    doc.setTextColor(140);
    doc.setFontSize(9);
    doc.text("Powered by EventSuite by Vermaak", 14, y + 8);
    doc.save(`receipt-${receipt.reference}.pdf`);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (!link || !link.is_active) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">Payment link unavailable</h1>
          <p className="text-muted-foreground mt-1">This link is inactive or does not exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2"><BrandLogo className="h-7 w-7" /><span className="font-semibold">EventSuite</span></div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>{link.title}</CardTitle>
            {link.description && <p className="text-sm text-muted-foreground">{link.description}</p>}
          </CardHeader>
          <CardContent className="space-y-4">
            {stage === "form" && (
              <>
                <div className="rounded-lg border border-border bg-muted/30 p-3 flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Amount</span>
                  <span className="font-bold text-primary">{formatMoney(amount, link.currency)}</span>
                </div>

                {link.amount_mode === "quantity" && (
                  <div className="space-y-2">
                    <Label>Quantity ({formatMoney(Number(link.unit_amount), link.currency)} each)</Label>
                    <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))} />
                  </div>
                )}
                {link.amount_mode === "open" && (
                  <div className="space-y-2">
                    <Label>Amount you want to pay</Label>
                    <Input type="number" min={0} value={openAmount} onChange={(e) => setOpenAmount(e.target.value)} placeholder="0" />
                    {(link.min_amount || link.max_amount) && (
                      <p className="text-xs text-muted-foreground">
                        {link.min_amount ? `Min ${formatMoney(Number(link.min_amount), link.currency)}` : ""}
                        {link.min_amount && link.max_amount ? " · " : ""}
                        {link.max_amount ? `Max ${formatMoney(Number(link.max_amount), link.currency)}` : ""}
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-2"><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></div>
                <div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} /></div>
                {link.note_label && (
                  <div className="space-y-2">
                    <Label>{link.note_label}{link.note_required ? " *" : ""}</Label>
                    <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Payment method</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => { setChannel("momo"); setError(""); }}
                      className={`border rounded-lg p-3 flex items-center gap-2 text-sm font-medium ${channel === "momo" ? "border-primary bg-primary/5" : "border-border"}`}>
                      <Smartphone className="h-4 w-4" />Mobile money
                    </button>
                    <button type="button" onClick={() => { setChannel("card"); setError(""); }}
                      className={`border rounded-lg p-3 flex items-center gap-2 text-sm font-medium ${channel === "card" ? "border-primary bg-primary/5" : "border-border"}`}>
                      <CreditCard className="h-4 w-4" />Card
                    </button>
                  </div>
                </div>

                {channel === "momo" ? (
                  <div className="space-y-2">
                    <Label>Mobile money number</Label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0770 000 000" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Card number</Label>
                    <Input value={formatCardNumber(cardNumber)} onChange={(e) => setCardNumber(e.target.value)} placeholder="0000 0000 0000 0000" inputMode="numeric" />
                    {cardCheck.brand !== "unknown" && (
                      <p className="text-xs text-muted-foreground">{BRAND_LABEL[cardCheck.brand as CardBrand]} detected</p>
                    )}
                  </div>
                )}

                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button className="w-full" onClick={start}>Pay {formatMoney(amount, link.currency)}</Button>
              </>
            )}

            {stage === "waiting" && (
              <div className="text-center py-8 space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                <p className="font-medium">Waiting for confirmation…</p>
                <p className="text-sm text-muted-foreground">Approve the prompt on your phone to complete the payment.</p>
                <Button variant="outline" onClick={manualCheck} disabled={checking}>{checking ? "Checking…" : "Check status"}</Button>
              </div>
            )}

            {stage === "success" && receipt && (
              <div className="text-center py-6 space-y-3">
                <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
                <p className="font-semibold">Payment received</p>
                <div className="text-left rounded-lg border border-border p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span className="font-medium">{receipt.reference}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-medium">{formatMoney(receipt.amount, receipt.currency)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-medium">{receipt.payer_name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="font-medium">{receipt.payer_email}</span></div>
                </div>
                <Button className="w-full gap-2" onClick={downloadReceipt}><Download className="h-4 w-4" />Download receipt</Button>
              </div>
            )}

            {stage === "failed" && (
              <div className="text-center py-6 space-y-3">
                <XCircle className="h-10 w-10 text-destructive mx-auto" />
                <p className="font-semibold">{failure?.title || "Payment failed"}</p>
                <p className="text-sm text-muted-foreground">{failure?.description}</p>
                <div className="flex gap-2 justify-center">
                  {paymentId && <Button variant="outline" onClick={manualCheck} disabled={checking}>Check status</Button>}
                  <Button onClick={() => { setStage("form"); setPaymentId(null); }}>Try again</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default PayLink;
