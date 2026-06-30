import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import { Ticket, ArrowRight, AlertCircle } from "lucide-react";

type LoginError = { kind: "invalid_credentials" | "unconfirmed" | "rate" | "other"; email: string; message: string };

const sendSetPasswordLink = async (email: string) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
};

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState<LoginError | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();
  const from = (location.state as any)?.from as string | undefined;
  const redirectTarget = from && !from.startsWith("/auth") ? from : "/dashboard";

  useEffect(() => {
    if (session) navigate(redirectTarget, { replace: true });
  }, [session, redirectTarget, navigate]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoginError(null);
    const normalizedEmail = email.trim().toLowerCase();
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (error) {
          // If the account exists but has no password yet (magic-link only),
          // claim this typed password as the new password and sign in.
          if ((error.message || "").toLowerCase().includes("invalid login credentials")) {
            const { data: claim } = await supabase.functions.invoke("claim-password", {
              body: { email: normalizedEmail, password },
            });
            if (claim?.ok) {
              const { error: retryErr } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
              if (!retryErr) {
                toast({ title: "Password set", description: "You can use this password from now on." });
                navigate(redirectTarget, { replace: true });
                return;
              }
              throw retryErr;
            }
          }
          throw error;
        }
        navigate(redirectTarget, { replace: true });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail, password,
          options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (data.user) {
          await supabase.from("user_roles").insert({ user_id: data.user.id, role: "attendee" as any });
        }
        toast({ title: "Welcome to EventSuite!", description: "Your account is ready." });
        if (data.session) navigate(redirectTarget, { replace: true });
        else setIsLogin(true);
      }
    } catch (err: any) {
      const msg = (err?.message || "").toLowerCase();
      let kind: LoginError["kind"] = "other";
      let friendly = err?.message || "Something went wrong.";
      if (msg.includes("invalid login credentials")) {
        kind = "invalid_credentials";
        friendly = "We couldn't sign you in with that email and password.";
      } else if (msg.includes("email not confirmed")) {
        kind = "unconfirmed";
        friendly = "Please confirm your email address using the link we sent you, then sign in again.";
      } else if (msg.includes("rate")) {
        kind = "rate";
        friendly = "Too many attempts — please wait a moment and try again.";
      }
      if (isLogin) {
        setLoginError({ kind, email: normalizedEmail, message: friendly });
      } else {
        toast({ title: "Sign-up failed", description: friendly, variant: "destructive" });
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-4">
            <BrandLogo className="h-10 w-10" />
            <span className="text-2xl font-bold text-white">EventSuite</span>
          </Link>
          <p className="text-white/70 text-sm">Events made simple — a product of Vermaak</p>
        </div>

        <Card className="shadow-elevated">
          <CardHeader>
            <CardTitle>{isLogin ? "Welcome back" : "Create your account"}</CardTitle>
            <CardDescription>{isLogin ? "Sign in to manage your events and tickets" : "Start hosting and discovering events"}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" required />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Loading…" : isLogin ? "Sign in" : "Create account"}<ArrowRight className="h-4 w-4" />
              </Button>
              {isLogin && loginError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Sign-in failed</AlertTitle>
                  <AlertDescription className="space-y-3">
                    <p>{loginError.message}</p>
                    {loginError.kind === "invalid_credentials" && (
                      <>
                        <p className="text-xs">
                          If you previously signed in using an email link (no password), tap <strong>Set your password</strong> below — we'll email you a secure link to choose one. From then on, you can sign in with your email and password.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={async () => {
                              try {
                                await sendSetPasswordLink(loginError.email);
                                toast({ title: "Check your inbox", description: `We sent a link to ${loginError.email} so you can set a password.` });
                              } catch (err: any) {
                                toast({ title: "Couldn't send link", description: err.message, variant: "destructive" });
                              }
                            }}
                          >
                            Set your password
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => { setPassword(""); setLoginError(null); }}>
                            Try a different password
                          </Button>
                        </div>
                      </>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </form>
            <div className="mt-4 flex flex-col items-center gap-2">
              <button onClick={() => setIsLogin(!isLogin)} className="text-sm text-muted-foreground hover:text-primary transition-colors">
                {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
              </button>
              {isLogin && (
                <Link to="/forgot-password" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Forgot your password?
                </Link>
              )}
            </div>
            <p className="mt-6 text-xs text-muted-foreground text-center">
              By continuing you agree to our <Link to="/legal/terms" className="underline">Terms</Link> and <Link to="/legal/privacy" className="underline">Privacy Policy</Link>.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
