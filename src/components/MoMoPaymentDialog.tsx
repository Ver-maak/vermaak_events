import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CheckCircle2, Loader2, Smartphone, XCircle } from "lucide-react";
import { formatMoney } from "@/lib/format";

export type MoMoProvider = "mtn_momo" | "airtel_money";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  amount: number;
  currency: string;
  defaultPhone?: string;
  onConfirm: (result: { method: MoMoProvider; phone: string; reference: string }) => Promise<void>;
}

type Stage = "form" | "prompt" | "waiting" | "success" | "failed";

const AUTO_APPROVE_MS = 5000; // simulated "user enters PIN" delay

const MoMoPaymentDialog = ({ open, onOpenChange, amount, currency, defaultPhone, onConfirm }: Props) => {
  const [provider, setProvider] = useState<MoMoProvider>("mtn_momo");
  const [phone, setPhone] = useState(defaultPhone || "");
  const [stage, setStage] = useState<Stage>("form");
  const [countdown, setCountdown] = useState(AUTO_APPROVE_MS / 1000);
  const [error, setError] = useState("");
  const cancelledRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setStage("form");
      setError("");
      cancelledRef.current = false;
    }
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [open]);

  const providerLabel = provider === "mtn_momo" ? "MTN Mobile Money" : "Airtel Money";
  const validPhone = /^\+?\d{9,15}$/.test(phone.replace(/\s/g, ""));

  const runFlow = async () => {
    if (!validPhone) { setError("Enter a valid phone number"); return; }
    setError("");
    cancelledRef.current = false;

    // Stage 1: dispatching prompt
    setStage("prompt");
    await sleep(1200);
    if (cancelledRef.current) return;

    // Stage 2: waiting for PIN, with countdown
    setStage("waiting");
    setCountdown(AUTO_APPROVE_MS / 1000);
    const start = Date.now();
    await new Promise<void>((resolve) => {
      timerRef.current = window.setInterval(() => {
        const remaining = Math.max(0, AUTO_APPROVE_MS - (Date.now() - start));
        setCountdown(Math.ceil(remaining / 1000));
        if (remaining <= 0 || cancelledRef.current) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          resolve();
        }
      }, 200) as unknown as number;
    });
    if (cancelledRef.current) return;

    // Stage 3: confirm via backend (creates intent + triggers signed webhook)
    try {
      const ref = (provider === "mtn_momo" ? "MTN-" : "AIR-") + Date.now().toString(36).toUpperCase();
      await onConfirm({ method: provider, phone, reference: ref });
      setStage("success");
      setTimeout(() => onOpenChange(false), 1200);
    } catch (e: any) {
      setError(e.message || "Payment failed");
      setStage("failed");
    }
  };

  const cancel = () => {
    cancelledRef.current = true;
    if (timerRef.current) window.clearInterval(timerRef.current);
    setError("Payment cancelled on phone");
    setStage("failed");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (stage !== "prompt" && stage !== "waiting") onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-primary" />Mobile Money Payment</DialogTitle>
          <DialogDescription>Pay {formatMoney(amount, currency)} securely from your phone.</DialogDescription>
        </DialogHeader>

        {stage === "form" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Choose provider</Label>
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
              <Label>Mobile money number</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+256 7XX XXX XXX" />
              <p className="text-[11px] text-muted-foreground">You'll receive a prompt on this number to enter your PIN.</p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" onClick={runFlow}>Send payment request</Button>
          </div>
        )}

        {stage === "prompt" && (
          <div className="py-8 text-center space-y-3">
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
            <p className="font-medium">Sending request to {phone}…</p>
            <p className="text-sm text-muted-foreground">Initiating {providerLabel}</p>
          </div>
        )}

        {stage === "waiting" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-primary animate-pulse" />Check your phone
              </p>
              <p className="text-xs text-muted-foreground">
                A {providerLabel} prompt for <span className="font-medium text-foreground">{formatMoney(amount, currency)}</span> has been sent to <span className="font-medium text-foreground">{phone}</span>. Enter your PIN to authorize.
              </p>
              <p className="text-xs text-primary">Auto-confirming in {countdown}s…</p>
            </div>
            <Button variant="outline" className="w-full" onClick={cancel}>Cancel payment</Button>
            <p className="text-[10px] text-muted-foreground text-center">Demo mode — auto-approves after a few seconds to simulate PIN entry.</p>
          </div>
        )}

        {stage === "success" && (
          <div className="py-8 text-center space-y-2">
            <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
            <p className="font-medium">Payment received</p>
            <p className="text-sm text-muted-foreground">Generating your tickets…</p>
          </div>
        )}

        {stage === "failed" && (
          <div className="space-y-4">
            <div className="py-4 text-center space-y-2">
              <XCircle className="h-10 w-10 text-destructive mx-auto" />
              <p className="font-medium">Payment failed</p>
              <p className="text-sm text-muted-foreground">{error || "Please try again."}</p>
            </div>
            <Button className="w-full" variant="outline" onClick={() => setStage("form")}>Try again</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default MoMoPaymentDialog;

