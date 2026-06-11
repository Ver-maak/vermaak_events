import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Mail, MailCheck, ArrowLeft } from "lucide-react";

interface Props {
  defaultEmail?: string;
  defaultName?: string;
  /** Optional — called once the user returns from the magic link and has a session. */
  onVerified?: (email: string) => void;
}

/**
 * Passwordless checkout gate. The buyer enters their name + email; Supabase
 * sends a magic sign-in link that returns them to this page already signed in.
 * The link is single-use and expires after 10 minutes (configured in the
 * backend auth settings).
 */
export const EmailOtpGate = ({ defaultEmail = "", defaultName = "" }: Props) => {
  const [email, setEmail] = useState(defaultEmail);
  const [name, setName] = useState(defaultName);
  const [stage, setStage] = useState<"form" | "sent">("form");
  const [busy, setBusy] = useState(false);

  const sendLink = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    if (!cleanName) {
      toast({ title: "Name required", description: "Please tell us who's buying.", variant: "destructive" });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      toast({ title: "Invalid email", description: "Enter a valid email address", variant: "destructive" });
      return;
    }
    setBusy(true);
    const returnTo = window.location.pathname + window.location.search + window.location.hash;
    try { sessionStorage.setItem("es:post-login-redirect", returnTo); } catch {}
    try { localStorage.setItem("es:post-login-redirect", returnTo); } catch {}
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: window.location.href,
        data: { full_name: cleanName },
      },
    });
    setBusy(false);
    if (error) {
      toast({ title: "Could not send link", description: error.message, variant: "destructive" });
      return;
    }
    setEmail(cleanEmail);
    setStage("sent");
    toast({ title: "Magic link sent", description: `Check ${cleanEmail} and tap the link to continue.` });
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        {stage === "form" ? <Mail className="h-4 w-4 text-primary" /> : <MailCheck className="h-4 w-4 text-primary" />}
        {stage === "form" ? "Verify your email to continue" : "Check your email"}
      </div>

      {stage === "form" ? (
        <>
          <Label className="text-xs">Full name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
            autoComplete="name"
            disabled={busy}
          />
          <Label className="text-xs">Email address</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            disabled={busy}
            onKeyDown={(e) => e.key === "Enter" && sendLink()}
          />
          <Button className="w-full" onClick={sendLink} disabled={busy}>
            {busy ? "Sending…" : "Email me a sign-in link"}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            We'll email you a secure sign-in link — no password needed. The link expires in 10 minutes.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm">
            We sent a sign-in link to <span className="font-medium">{email}</span>. Open your inbox and tap the link to
            return here and complete your purchase.
          </p>
          <p className="text-[11px] text-muted-foreground">
            The link expires in 10 minutes. If it expires, request a new one.
          </p>
          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => setStage("form")}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Change email
            </button>
            <button
              type="button"
              onClick={sendLink}
              disabled={busy}
              className="text-primary hover:underline disabled:opacity-50"
            >
              Resend link
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default EmailOtpGate;
