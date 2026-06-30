import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CheckCircle2, Loader2, Smartphone, XCircle, RefreshCw, AlertCircle } from "lucide-react";
import { formatMoney } from "@/lib/format";
import FeeBreakdown from "@/components/FeeBreakdown";
import { explainPaymentError, type FriendlyFailure } from "@/lib/paymentErrors";

export type MoMoProvider = "mtn_momo" | "airtel_money";

export interface FeeQuote {
  subtotal: number;
  fee: number;
  grandTotal: number;
  currency: string;
  tierLabel?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  amount: number;
  currency: string;
  defaultPhone?: string;
  feeQuote?: FeeQuote | null;
  organizationId?: string;
  /** Returns when the payment is fully confirmed (success). Throws with a message on failure. */
  onConfirm: (result: { method: MoMoProvider; phone: string; reference: string }) => Promise<void>;
  /** Optional manual reconciliation — called when the buyer taps "Check status". */
  onManualVerify?: () => Promise<"success" | "failed" | "cancelled" | "pending">;
}

type Stage = "form" | "prompt" | "waiting" | "success" | "failed";

const WAIT_TIMEOUT_MS = 120_000;

const fallbackFee = (subtotal: number) => {
  if (subtotal <= 0) return 0;
  return Math.round(Math.min(5000, Math.max(500, subtotal * 0.03)));
};

const MoMoPaymentDialog = ({
  open, onOpenChange, amount, currency, defaultPhone, feeQuote, organizationId,
  onConfirm, onManualVerify,
}: Props) => {
  const processingFee = feeQuote ? feeQuote.fee : fallbackFee(amount);
  const grandTotal = feeQuote ? feeQuote.grandTotal : amount + processingFee;
  const tierLabel = feeQuote?.tierLabel;
  const [provider, setProvider] = useState<MoMoProvider>("mtn_momo");
  const [phone, setPhone] = useState(defaultPhone || "");
  const [stage, setStage] = useState<Stage>("form");
  const [countdown, setCountdown] = useState(WAIT_TIMEOUT_MS / 1000);
  const [failure, setFailure] = useState<FriendlyFailure | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const cancelledRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setStage("form");
      setError("");
      setFailure(null);
      cancelledRef.current = false;
    }
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [open]);

  const providerLabel = provider === "mtn_momo" ? "MTN Mobile Money" : "Airtel Money";
  const normalizePhone = (raw: string) => {
    const digits = raw.replace(/[^\d+]/g, "");
    if (digits.startsWith("+")) return digits;
    if (digits.startsWith("256")) return "+" + digits;
    if (digits.startsWith("0")) return "+256" + digits.slice(1);
    if (/^[7][0-9]{8}$/.test(digits)) return "+256" + digits;
    return digits;
  };
  const normalizedPhone = normalizePhone(phone);
  const validPhone = /^\+\d{9,15}$/.test(normalizedPhone);

  const runFlow = async () => {
    if (!validPhone) { setError("Enter a valid phone number"); return; }
    setError("");
    setFailure(null);
    cancelledRef.current = false;

    setStage("prompt");
    const ref = "REF-" + Date.now().toString(36).toUpperCase();

    setStage("waiting");
    setCountdown(WAIT_TIMEOUT_MS / 1000);
    const start = Date.now();
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      const remaining = Math.max(0, WAIT_TIMEOUT_MS - (Date.now() - start));
      setCountdown(Math.ceil(remaining / 1000));
      if (remaining <= 0 && timerRef.current) window.clearInterval(timerRef.current);
    }, 1000) as unknown as number;

    try {
      await onConfirm({ method: provider, phone: normalizedPhone, reference: ref });
      if (cancelledRef.current) return;
      setStage("success");
      setTimeout(() => onOpenChange(false), 1500);
    } catch (e: any) {
      if (cancelledRef.current) return;
      setFailure(explainPaymentError(e));
      setStage("failed");
    } finally {
      if (timerRef.current) window.clearInterval(timerRef.current);
    }
  };

  const cancel = () => {
    cancelledRef.current = true;
    if (timerRef.current) window.clearInterval(timerRef.current);
    setFailure(explainPaymentError("Payment cancelled by user"));
    setStage("failed");
  };

  const checkStatus = async () => {
    if (!onManualVerify) return;
    setVerifying(true);
    try {
      const status = await onManualVerify();
      if (status === "success") {
        setStage("success");
        setTimeout(() => onOpenChange(false), 1500);
      } else if (status === "pending") {
        setFailure({
          kind: "timeout",
          title: "Still pending",
          description: "Swarmbyte hasn't confirmed yet. Approve the prompt on your phone, then check again.",
          retryable: true,
        });
      } else {
        setFailure(explainPaymentError(`Payment ${status}`));
      }
    } catch (e: any) {
      setFailure(explainPaymentError(e));
    } finally {
      setVerifying(false);
    }
  };

  const locked = stage === "prompt" || stage === "waiting" || verifying;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!locked) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-primary" />Mobile Money Payment</DialogTitle>
        </DialogHeader>

        {stage === "form" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatMoney(amount, currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Fee</span>
                <span className="font-medium">{formatMoney(processingFee, currency)}</span>
              </div>
              <div className="h-px bg-border my-1" />
              <div className="flex justify-between">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-primary">{formatMoney(grandTotal, currency)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Provider</Label>
              <RadioGroup value={provider} onValueChange={(v) => setProvider(v as MoMoProvider)} className="grid grid-cols-2 gap-2">
                <Label htmlFor="mtn" className={`border rounded-lg p-3 cursor-pointer flex items-center gap-2 ${provider==="mtn_momo"?"border-primary bg-primary/5":"border-border"}`}>
                  <RadioGroupItem value="mtn_momo" id="mtn" />
                  <span className="font-medium">MTN MoMo</span>
                </Label>
                <Label htmlFor="airtel" className={`border rounded-lg p-3 cursor-pointer flex items-center gap-2 ${provider==="airtel_money"?"border-primary bg-primary/5":"border-border"}`}>
                  <RadioGroupItem value="airtel_money" id="airtel" />
                  <span className="font-medium">Airtel Money</span>
                </Label>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label>Phone number</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+256 7XX XXX XXX" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" onClick={runFlow}>Pay {formatMoney(grandTotal, currency)}</Button>
          </div>
        )}

        {stage === "prompt" && (
          <div className="py-8 text-center space-y-3">
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
            <p className="font-medium">Sending request to {phone}…</p>
          </div>
        )}

        {stage === "waiting" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-2 text-center">
              <Smartphone className="h-6 w-6 text-primary mx-auto animate-pulse" />
              <p className="text-sm font-medium">Check your phone</p>
              <p className="text-xs text-muted-foreground">
                Enter your PIN to pay <span className="font-medium text-foreground">{formatMoney(grandTotal, currency)}</span>
              </p>
              <p className="text-xs text-primary">Waiting… {countdown}s</p>
            </div>
            <Button variant="outline" className="w-full" onClick={cancel}>Cancel</Button>
          </div>
        )}

        {stage === "success" && (
          <div className="py-8 text-center space-y-2">
            <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
            <p className="font-medium">Payment received</p>
            <p className="text-sm text-muted-foreground">Generating your tickets…</p>
          </div>
        )}

        {stage === "failed" && failure && (
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-2">
              <div className="flex items-start gap-2">
                {failure.kind === "timeout" ? (
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <p className="font-medium text-sm">{failure.title}</p>
                  <p className="text-xs text-muted-foreground">{failure.description}</p>
                </div>
              </div>
            </div>

            {onManualVerify && failure.kind !== "duplicate" && (
              <Button variant="outline" className="w-full gap-2" disabled={verifying} onClick={checkStatus}>
                <RefreshCw className={`h-4 w-4 ${verifying ? "animate-spin" : ""}`} />
                {verifying ? "Checking with Swarmbyte…" : "Check status now"}
              </Button>
            )}

            {failure.retryable ? (
              <Button className="w-full" onClick={() => setStage("form")}>Try again</Button>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>Close</Button>
            )}
            <p className="text-[10px] text-muted-foreground text-center">
              Charged but no tickets? Use "Check status" — it reconciles directly with the provider.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default MoMoPaymentDialog;
