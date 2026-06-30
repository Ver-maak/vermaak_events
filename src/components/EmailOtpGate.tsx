import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Mail } from "lucide-react";

interface Props {
  defaultEmail?: string;
  defaultName?: string;
  /** Called once the user has a valid session. */
  onVerified?: (email: string) => void;
}

/**
 * Seamless checkout gate. Buyer enters name + email + password once.
 * We try to sign in first; if the account doesn't exist we transparently
 * create it and sign them in — no mode switching required.
 */
export const EmailOtpGate = ({ defaultEmail = "", defaultName = "", onVerified }: Props) => {
  const [email, setEmail] = useState(defaultEmail);
  const [name, setName] = useState(defaultName);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrongPassword, setWrongPassword] = useState(false);
  const verifiedRef = useRef(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user?.email && !verifiedRef.current) {
        verifiedRef.current = true;
        onVerified?.(session.user.email);
      }
    });
    return () => subscription.unsubscribe();
  }, [onVerified]);

  const submit = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      toast({ title: "Invalid email", description: "Enter a valid email address", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Password too short", description: "Use at least 6 characters.", variant: "destructive" });
      return;
    }
    setBusy(true);
    setWrongPassword(false);
    try {
      // Try sign up first — if the email is new this signs them in immediately.
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: { full_name: cleanName || cleanEmail.split("@")[0] },
          emailRedirectTo: window.location.origin + window.location.pathname + window.location.search,
        },
      });

      const alreadyExists =
        signUpError && /registered|already|exists/i.test(signUpError.message || "");

      if (alreadyExists) {
        // Existing account — sign in with the password they typed.
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (signInErr) {
          setWrongPassword(true);
          toast({
            title: "Wrong password",
            description: "An account with this email already exists. Enter your existing password to continue.",
            variant: "destructive",
          });
        }
        return;
      }

      if (signUpError) {
        toast({ title: "Couldn't continue", description: signUpError.message, variant: "destructive" });
        return;
      }

      // Brand new account
      if (signUpData.user && !signUpData.session) {
        // In case email confirmation is enabled, try to sign in directly.
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (signInErr) {
          toast({
            title: "Confirm your email",
            description: "We sent a confirmation link to your inbox. Open it, then come back to continue.",
          });
          return;
        }
      }
      if (signUpData.user) {
        try {
          await supabase.from("user_roles").insert({ user_id: signUpData.user.id, role: "attendee" as any });
        } catch {}
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Mail className="h-4 w-4 text-primary" />
        Continue to payment
      </div>
      <p className="text-xs text-muted-foreground">
        Enter your details to continue. We'll create your account automatically if you're new, or sign you in if you've bought tickets before.
      </p>

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
      />
      <Label className="text-xs">Password</Label>
      <Input
        type="password"
        value={password}
        onChange={(e) => { setPassword(e.target.value); setWrongPassword(false); }}
        placeholder="At least 6 characters"
        autoComplete="current-password"
        disabled={busy}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      {wrongPassword && (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-xs text-destructive">
            That password doesn't match an existing account. If you previously used an email login link, set a password now — we'll email you a secure link to choose one, and you can sign in with email and password from then on.
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              const clean = email.trim().toLowerCase();
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
                toast({ title: "Enter your email first", variant: "destructive" });
                return;
              }
              setBusy(true);
              try {
                const { error } = await supabase.auth.resetPasswordForEmail(clean, {
                  redirectTo: window.location.origin + "/reset-password",
                });
                if (error) throw error;
                toast({ title: "Check your inbox", description: `We sent a link to ${clean} so you can set a password.` });
              } catch (err: any) {
                toast({ title: "Couldn't send link", description: err.message, variant: "destructive" });
              } finally {
                setBusy(false);
              }
            }}
          >
            Email me a link to set my password
          </Button>
        </div>
      )}
      <Button className="w-full" onClick={submit} disabled={busy}>
        {busy ? "Please wait…" : "Continue"}
      </Button>
    </div>
  );
};

export default EmailOtpGate;
