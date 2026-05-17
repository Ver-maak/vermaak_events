import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import { KeyRound, Loader2, CheckCircle2 } from "lucide-react";

const ChangePassword = () => {
  const { user, profile, session, roles, loading } = useAuth();
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate("/auth", { replace: true });
  }, [loading, session, navigate]);

  const redirectPath = () => {
    if (roles.includes("super_admin")) return "/dashboard/tenants";
    if (roles.includes("tenant_admin")) return "/dashboard/team";
    return "/dashboard";
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || success) return;
    if (pw.length < 8) return toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" });
    if (pw !== pw2) return toast({ title: "Passwords don't match", variant: "destructive" });
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      if (user) {
        await supabase.from("profiles").update({ must_change_password: false }).eq("id", user.id);
      }
      setSuccess(true);
      toast({ title: "Password updated", description: "Redirecting to your dashboard..." });
      const target = redirectPath();
      setTimeout(() => {
        navigate(target, { replace: true });
        setTimeout(() => window.location.reload(), 150);
      }, 900);
    } catch (err: any) {
      toast({ title: "Could not update password", description: err.message, variant: "destructive" });
      setSaving(false);
    }
  };

  const disabled = saving || success;

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-elevated">
        <CardHeader>
          <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow mb-2">
            <KeyRound className="h-5 w-5 text-primary-foreground" />
          </div>
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>
            For security, you must change your temporary password before continuing.
            {profile?.email && <span className="block mt-1 text-xs">Signed in as {profile.email}</span>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success && (
            <Alert className="mb-4 border-success/40 bg-success/10">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <AlertTitle className="text-success">Password updated</AlertTitle>
              <AlertDescription>Taking you to your dashboard…</AlertDescription>
            </Alert>
          )}
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pw">New password</Label>
              <Input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} required disabled={disabled} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw2">Confirm password</Label>
              <Input id="pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} minLength={8} required disabled={disabled} />
            </div>
            <Button type="submit" className="w-full" disabled={disabled}>
              {success ? (
                <><CheckCircle2 className="h-4 w-4 mr-2" />Updated</>
              ) : saving ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Updating…</>
              ) : (
                "Update password"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChangePassword;
