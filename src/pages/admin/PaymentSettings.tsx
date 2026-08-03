import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { CreditCard, Loader2, Plus, ShieldCheck } from "lucide-react";
import { getFunctionErrorMessage } from "@/lib/paymentErrors";

const BUILT_IN_PROVIDERS = [
  { code: "swarmbyte", name: "Swarmbyte Payments" },
];

type Mode = "sandbox" | "live";

interface FormState {
  name: string;
  enabled: boolean;
  mode: Mode;
  base_url: string;
  callback_url: string;
  redirect_success_url: string;
  redirect_cancel_url: string;
  api_key: string;
  api_secret: string;
  wallet_address: string;
  webhook_secret: string;
  auth_type: string;
  api_key_header: string;
  token_path: string;
  collect_path: string;
  status_path: string;
  preview: Record<string, string>;
}

const empty: FormState = {
  name: "Swarmbyte Payments",
  enabled: false,
  mode: "sandbox",
  base_url: "https://stg-api.swarmbyte.com",
  callback_url: "",
  redirect_success_url: "",
  redirect_cancel_url: "",
  api_key: "",
  api_secret: "",
  wallet_address: "",
  webhook_secret: "",
  auth_type: "oauth",
  api_key_header: "Authorization",
  token_path: "/v1/oauth/collections/token",
  collect_path: "/v1/collect",
  status_path: "/v1/collect/transactions/{id}",
  preview: {},
};

function mask(v: string) {
  if (!v) return "";
  if (v.length <= 8) return "••••";
  return `${v.slice(0, 4)}••••${v.slice(-4)}`;
}

export default function PaymentSettings() {
  const { roles, loading } = useAuth();
  const [providers, setProviders] = useState(BUILT_IN_PROVIDERS);
  const [code, setCode] = useState("swarmbyte");
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");

  const isCustom = !BUILT_IN_PROVIDERS.some((p) => p.code === code);
  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payments-webhook?provider=${code}`;

  const loadProviders = async () => {
    const { data } = await supabase.from("payment_providers").select("code,name").order("name");
    const merged = [...BUILT_IN_PROVIDERS];
    (data || []).forEach((p: any) => {
      if (!merged.some((m) => m.code === p.code)) merged.push({ code: p.code, name: p.name });
    });
    setProviders(merged);
  };

  useEffect(() => { loadProviders(); }, []);

  useEffect(() => {
    (async () => {
      setLoaded(false);
      const { data } = await supabase
        .from("payment_providers")
        .select("name,enabled,mode,base_url,callback_url,redirect_success_url,redirect_cancel_url,credentials_preview")
        .eq("code", code)
        .maybeSingle();
      if (data) {
        const p = (data.credentials_preview as Record<string, string>) || {};
        setForm({
          ...empty,
          name: data.name,
          enabled: data.enabled,
          mode: (data.mode as Mode) || "sandbox",
          base_url: data.base_url || "",
          callback_url: data.callback_url || "",
          redirect_success_url: data.redirect_success_url || "",
          redirect_cancel_url: data.redirect_cancel_url || "",
          auth_type: p.auth_type || "oauth",
          api_key_header: p.api_key_header || "Authorization",
          token_path: p.token_path || empty.token_path,
          collect_path: p.collect_path || empty.collect_path,
          status_path: p.status_path || empty.status_path,
          api_key: "", api_secret: "", wallet_address: "", webhook_secret: "",
          preview: p,
        });
      } else {
        const known = providers.find((p) => p.code === code);
        setForm({ ...empty, name: known?.name || code, base_url: "" });
      }
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (loading) return null;
  if (!roles.includes("super_admin")) return <Navigate to="/dashboard" replace />;

  const addProvider = () => {
    const slug = newCode.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    if (!slug || !newName.trim()) {
      toast({ title: "Missing details", description: "Provide a code and a display name.", variant: "destructive" });
      return;
    }
    if (providers.some((p) => p.code === slug)) {
      toast({ title: "Already exists", description: "That provider code is already in the list.", variant: "destructive" });
      return;
    }
    setProviders((ps) => [...ps, { code: slug, name: newName.trim() }]);
    setCode(slug);
    setAddOpen(false);
    setNewCode(""); setNewName("");
    toast({ title: "Provider added", description: "Fill in the API details below and save." });
  };


  const save = async () => {
    setSaving(true);
    try {
      const newCreds: Record<string, string> = {};
      const preview = { ...form.preview };
      if (form.api_key) { newCreds.api_key = form.api_key; preview.api_key = mask(form.api_key); }
      if (form.api_secret) { newCreds.api_secret = form.api_secret; preview.api_secret = mask(form.api_secret); }
      if (form.wallet_address) { newCreds.wallet_address = form.wallet_address; preview.wallet_address = mask(form.wallet_address); }
      if (form.webhook_secret) { newCreds.webhook_secret = form.webhook_secret; preview.webhook_secret = mask(form.webhook_secret); }
      if (isCustom) {
        newCreds.auth_type = form.auth_type;
        newCreds.api_key_header = form.api_key_header;
        newCreds.token_path = form.token_path;
        newCreds.collect_path = form.collect_path;
        newCreds.status_path = form.status_path;
        preview.auth_type = form.auth_type;
        preview.api_key_header = form.api_key_header;
        preview.token_path = form.token_path;
        preview.collect_path = form.collect_path;
        preview.status_path = form.status_path;
      }


      const { data, error } = await supabase.functions.invoke("payments-save-credentials", {
        body: {
          code,
          name: form.name,
          enabled: form.enabled,
          mode: form.mode,
          base_url: form.base_url || null,
          callback_url: form.callback_url || null,
          redirect_success_url: form.redirect_success_url || null,
          redirect_cancel_url: form.redirect_cancel_url || null,
          credentials: newCreds,
          preview,
        },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || await getFunctionErrorMessage(error, "Could not save payment settings"));
      toast({ title: "Saved", description: "Payment provider updated." });
      setForm((f) => ({ ...f, api_key: "", api_secret: "", wallet_address: "", preview }));
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("payments-test-connection", { body: { code } });
      if (error) throw new Error(await getFunctionErrorMessage(error, "Could not test payment connection"));
      toast({
        title: data?.ok ? "Connection OK" : "Connection failed",
        description: data?.message || "",
        variant: data?.ok ? "default" : "destructive",
      });
    } catch (e: any) {
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><CreditCard className="h-6 w-6" /> Payment Settings</h1>
            <p className="text-sm text-muted-foreground">Configure payment provider credentials. Secrets are encrypted at rest and never returned to the browser.</p>
          </div>
          <Badge variant="secondary" className="gap-1"><ShieldCheck className="h-3 w-3" /> Encrypted</Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Provider</CardTitle>
            <CardDescription>Select which provider you are configuring, or add a new API provider.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Select value={code} onValueChange={setCode}>
              <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
              <SelectContent>
                {providers.map((p) => <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-1"><Plus className="h-4 w-4" /> Add provider</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add API provider</DialogTitle>
                  <DialogDescription>
                    Register a new payment API. After adding it, fill in the base URL, endpoint paths and credentials, then save and test.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <Field label="Display name" value={newName} onChange={setNewName} placeholder="Flutterwave" />
                  <Field label="Provider code (lowercase, no spaces)" value={newCode} onChange={setNewCode} placeholder="flutterwave" />
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
                  <Button onClick={addProvider}>Add</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>


        {loaded && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{form.name}</CardTitle>
                  <CardDescription>Sandbox or live mode + API credentials.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="enabled" className="text-sm">Enabled</Label>
                  <Switch id="enabled" checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Display name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
                <div className="space-y-1.5">
                  <Label>Mode</Label>
                  <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v as Mode })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sandbox">Sandbox (test)</SelectItem>
                      <SelectItem value="live">Live</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Field label="Base API URL" value={form.base_url} onChange={(v) => setForm({ ...form, base_url: v })} placeholder="https://api.swarmbyte.example" className="md:col-span-2" />
              </div>

              {isCustom && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
                  <div className="space-y-1.5">
                    <Label>Authentication</Label>
                    <Select value={form.auth_type} onValueChange={(v) => setForm({ ...form, auth_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="oauth">OAuth client credentials (token endpoint)</SelectItem>
                        <SelectItem value="header">API key in header</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.auth_type === "oauth"
                    ? <Field label="Token endpoint path" value={form.token_path} onChange={(v) => setForm({ ...form, token_path: v })} placeholder="/v1/oauth/token" />
                    : <Field label="API key header name" value={form.api_key_header} onChange={(v) => setForm({ ...form, api_key_header: v })} placeholder="Authorization" />}
                  <Field label="Payment (collect) path" value={form.collect_path} onChange={(v) => setForm({ ...form, collect_path: v })} placeholder="/v1/collect" />
                  <Field label="Status path ({id} placeholder)" value={form.status_path} onChange={(v) => setForm({ ...form, status_path: v })} placeholder="/v1/collect/transactions/{id}" />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <SecretField label="API key (client_id)" preview={form.preview.api_key} value={form.api_key} onChange={(v) => setForm({ ...form, api_key: v })} />
                <SecretField label="API secret (client_secret)" preview={form.preview.api_secret} value={form.api_secret} onChange={(v) => setForm({ ...form, api_secret: v })} />
                <SecretField label="Wallet / merchant address" preview={form.preview.wallet_address} value={form.wallet_address} onChange={(v) => setForm({ ...form, wallet_address: v })} />
                {isCustom && (
                  <SecretField label="Webhook signing secret (optional)" preview={form.preview.webhook_secret} value={form.webhook_secret} onChange={(v) => setForm({ ...form, webhook_secret: v })} />
                )}
              </div>
              {!isCustom && (
                <p className="text-xs text-muted-foreground">
                  Note: Swarmbyte webhooks are unsigned (per their docs). Security relies on HTTPS,
                  the unguessable Supabase function URL, and idempotent processing by transactionId.
                </p>
              )}

              <div className="space-y-1.5 pt-2">
                <Label>Webhook URL (configure this in the provider dashboard)</Label>
                <Input readOnly value={webhookUrl} onFocus={(e) => e.currentTarget.select()} />
              </div>



              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Callback URL override (optional)" value={form.callback_url} onChange={(v) => setForm({ ...form, callback_url: v })} placeholder="Defaults to the webhook URL above" />
                <div />
                <Field label="Redirect success URL" value={form.redirect_success_url} onChange={(v) => setForm({ ...form, redirect_success_url: v })} placeholder="https://events.vermaak.app/dashboard/my-tickets" />
                <Field label="Redirect cancel URL" value={form.redirect_cancel_url} onChange={(v) => setForm({ ...form, redirect_cancel_url: v })} placeholder="https://events.vermaak.app/events" />
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={save} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save
                </Button>
                <Button variant="outline" onClick={test} disabled={testing}>
                  {testing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Test connection
                </Button>
              </div>

              <p className="text-xs text-muted-foreground pt-2">
                Stored secrets are encrypted server-side. The form only shows masked previews; leave a field blank to keep its current value.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

function Field({ label, value, onChange, placeholder, className }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className || ""}`}>
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function SecretField({ label, preview, value, onChange }: { label: string; preview?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={preview ? `Current: ${preview} (leave blank to keep)` : "Enter value"}
      />
    </div>
  );
}
