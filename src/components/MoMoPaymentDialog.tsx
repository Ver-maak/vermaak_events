import { useState, useEffect } from "react";
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

const MoMoPaymentDialog = ({ open, onOpenChange, amount, currency, defaultPhone, onConfirm }: Props) => {
  const [provider, setProvider] = useState<MoMoProvider>("mtn_momo");
  const [phone, setPhone] = useState(defaultPhone || "");
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState("");

  useEffect(() => { if (open) { setStage("form"); setError(""); } }, [open]);

  const providerLabel = provider === "mtn_momo" ? "MTN Mobile Money" : "Airtel Money";
  const validPhone = /^\+?\d{9,15}$/.test(phone.replace(/\s/g, ""));

  const startPush = async () => {
    if (!validPhone) { setError("Enter a valid phone number"); return; }
    setError("");
    setStage("prompt");
    // Simulate STK push delay
    await new Promise((r) => setTimeout(r, 1500));
    setStage("waiting");
  };

  const approve = async () => {
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
    setStage("failed");
    setError("Payment cancelled on phone");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (stage !== "prompt") onOpenChange(o); }}>
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
              <p className="text-[11px] text-muted-foreground">You'll receive a prompt on this number to confirm the payment.</p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" onClick={startPush}>Send payment request</Button>
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
            <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2">
              <p className="text-sm font-medium">📱 Check your phone</p>
              <p className="text-xs text-muted-foreground">A payment prompt for <span className="font-medium text-foreground">{formatMoney(amount, currency)}</span> via {providerLabel} has been sent to <span className="font-medium text-foreground">{phone}</span>. Enter your PIN to authorize.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={cancel}>Cancel on phone</Button>
              <Button onClick={approve}>I authorized payment</Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">Demo mode — simulating real MoMo confirmation flow.</p>
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

export default MoMoPaymentDialog;
