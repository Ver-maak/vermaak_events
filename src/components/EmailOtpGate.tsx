import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Mail, KeyRound, ArrowLeft } from "lucide-react";

interface Props {
  defaultEmail?: string;
  onVerified: (email: string) => void;
}

/**
 * Lightweight passwordless gate used at checkout. The buyer enters an email,
 * Supabase emails a 6-digit OTP, and verifying it creates a session under the
 * hood — no separate sign-up / sign-in page.
 */
export const EmailOtpGate = ({ defaultEmail = "", onVerified }: Props) => {
  const [email, setEmail] = useState(defaultEmail);
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);

  const sendOtp = async () => {
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      toast({ title: "Invalid email", description: "Enter a valid email address", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: clean,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) {
      toast({ title: "Could not send code", description: error.message, variant: "destructive" });
      return;
    }
    setEmail(clean);
    setStage("code");
    toast({ title: "Code sent", description: `Check ${clean} for your 6-digit code.` });
  };

  const verifyOtp = async () => {
    const token = code.trim();
    if (token.length < 6) {
      toast({ title: "Enter the 6-digit code", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    setBusy(false);
    if (error) {
      toast({ title: "Invalid code", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Verified", description: "You can now complete your purchase." });
    onVerified(email);
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        {stage === "email" ? <Mail className="h-4 w-4 text-primary" /> : <KeyRound className="h-4 w-4 text-primary" />}
        {stage === "email" ? "Verify your email to continue" : "Enter the 6-digit code"}
      </div>

      {stage === "email" ? (
        <>
          <Label className="text-xs">Email address</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            disabled={busy}
            onKeyDown={(e) => e.key === "Enter" && sendOtp()}
          />
          <Button className="w-full" onClick={sendOtp} disabled={busy}>
            {busy ? "Sending…" : "Send verification code"}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            We'll email a one-time 6-digit code. No password needed.
          </p>
        </>
      ) : (
        <>
          <Label className="text-xs">Code sent to {email}</Label>
          <Input
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            autoFocus
            disabled={busy}
            onKeyDown={(e) => e.key === "Enter" && verifyOtp()}
          />
          <Button className="w-full" onClick={verifyOtp} disabled={busy || code.length < 6}>
            {busy ? "Verifying…" : "Verify & continue"}
          </Button>
          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => { setStage("email"); setCode(""); }}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Change email
            </button>
            <button
              type="button"
              onClick={sendOtp}
              disabled={busy}
              className="text-primary hover:underline disabled:opacity-50"
            >
              Resend code
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default EmailOtpGate;
