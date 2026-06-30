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
 * Lightweight checkout gate. The buyer enters name + email + password to
 * sign in or create an account inline — no magic link round-trip required.
 * If an account already exists for the email, we sign in; otherwise we
 * create one and sign in immediately.
 */
export const EmailOtpGate = ({ defaultEmail = "", defaultName = "", onVerified }: Props) => {
  const [email, setEmail] = useState(defaultEmail);
  const [name, setName] = useState(defaultName);
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const verifiedRef = useRef(false);

  // Notify caller when signed in
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
    if (mode === "signup" && !cleanName) {
      toast({ title: "Name required", description: "Please tell us who's buying.", variant: "destructive" });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      toast({ title: "Invalid email", description: "Enter a valid email address", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Password too short", description: "Use at least 6 characters.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) {
          const msg = (error.message || "").toLowerCase();
          if (msg.includes("invalid login")) {
            toast({
              title: "Couldn't sign in",
              description: "Wrong password, or you don't have an account yet. Switch to 'Create account' below if you're new.",
              variant: "destructive",
            });
          } else {
            toast({ title: "Sign-in failed", description: error.message, variant: "destructive" });
          }
          return;
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: { full_name: cleanName },
            emailRedirectTo: window.location.origin + window.location.pathname + window.location.search,
          },
        });
        if (error) {
          const msg = (error.message || "").toLowerCase();
          if (msg.includes("registered") || msg.includes("already")) {
            toast({
              title: "Account exists",
              description: "An account with this email already exists. Switch to 'Sign in' and enter your password.",
              variant: "destructive",
            });
            setMode("signin");
          } else {
            toast({ title: "Sign-up failed", description: error.message, variant: "destructive" });
          }
          return;
        }
        if (data.user && !data.session) {
          // Email confirmation enabled — try to sign them in directly
          const { error: signInErr } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
          if (signInErr) {
            toast({
              title: "Confirm your email",
              description: "We sent a confirmation link to your inbox. Open it, then come back to continue.",
            });
            return;
          }
        }
        if (data.user) {
          try {
            await supabase.from("user_roles").insert({ user_id: data.user.id, role: "attendee" as any });
          } catch {}
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Mail className="h-4 w-4 text-primary" />
        {mode === "signin" ? "Sign in to continue" : "Create your account"}
      </div>

      {mode === "signup" && (
        <>
          <Label className="text-xs">Full name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
            autoComplete="name"
            disabled={busy}
          />
        </>
      )}
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
        onChange={(e) => setPassword(e.target.value)}
        placeholder="At least 6 characters"
        autoComplete={mode === "signin" ? "current-password" : "new-password"}
        disabled={busy}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <Button className="w-full" onClick={submit} disabled={busy}>
        {busy ? "Please wait…" : mode === "signin" ? "Sign in & continue" : "Create account & continue"}
      </Button>
      <div className="text-xs text-center">
        {mode === "signin" ? (
          <button
            type="button"
            onClick={() => setMode("signup")}
            className="text-primary hover:underline"
          >
            New here? Create an account
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setMode("signin")}
            className="text-primary hover:underline"
          >
            Already have an account? Sign in
          </button>
        )}
      </div>
    </div>
  );
};

export default EmailOtpGate;
