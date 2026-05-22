import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Copy, KeyRound, Plus, Trash2, Webhook, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

const EVENT_TYPES = ["order.paid", "ticket.checked_in"] as const;

const Developer = () => {
  const qc = useQueryClient();
  const [keyName, setKeyName] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const [hookOpen, setHookOpen] = useState(false);
  const [hookUrl, setHookUrl] = useState("");
  const [hookEvents, setHookEvents] = useState<string[]>([...EVENT_TYPES]);
  const [hookDesc, setHookDesc] = useState("");
  const [revealedSecret, setRevealedSecret] = useState<{ url: string; secret: string } | null>(null);

  const keys = useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("api-keys", { method: "GET" });
      if (error) throw error;
      return data?.keys || [];
    },
  });

  const endpoints = useQuery({
    queryKey: ["webhook-endpoints"],
    queryFn: async () => {
      const { data, error } = await supabase.from("webhook_endpoints").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const recentDeliveries = useQuery({
    queryKey: ["webhook-deliveries"],
    queryFn: async () => {
      const { data } = await supabase.from("webhook_deliveries")
        .select("id, event_type, status, attempts, response_status, last_error, created_at, endpoint_id")
        .order("created_at", { ascending: false }).limit(20);
      return data || [];
    },
  });

  const createKey = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("api-keys?action=create", {
        body: { name: keyName || "Default key" },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      return data;
    },
    onSuccess: (data) => {
      setRevealedKey(data.key);
      setKeyName("");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e: any) => toast({ title: "Could not create key", description: e.message, variant: "destructive" }),
  });

  const revokeKey = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.functions.invoke("api-keys?action=revoke", { body: { id } });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  const createHook = useMutation({
    mutationFn: async () => {
      if (!/^https?:\/\//.test(hookUrl)) throw new Error("URL must start with http(s)://");
      const secret = "whsec_" + crypto.randomUUID().replace(/-/g, "");
      const { data, error } = await supabase.from("webhook_endpoints").insert({
        organizer_id: (await supabase.auth.getUser()).data.user?.id!,
        url: hookUrl, secret, events: hookEvents, description: hookDesc || null,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setRevealedSecret({ url: data.url, secret: data.secret });
      setHookOpen(false);
      setHookUrl(""); setHookDesc(""); setHookEvents([...EVENT_TYPES]);
      qc.invalidateQueries({ queryKey: ["webhook-endpoints"] });
    },
    onError: (e: any) => toast({ title: "Could not add endpoint", description: e.message, variant: "destructive" }),
  });

  const toggleHook = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("webhook_endpoints").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhook-endpoints"] }),
  });

  const deleteHook = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("webhook_endpoints").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhook-endpoints"] }),
  });

  const copy = (v: string, label = "Copied") => { navigator.clipboard.writeText(v); toast({ title: label }); };

  const apiBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tenant-api`;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Developer</h1>
          <p className="text-sm text-muted-foreground">API keys and webhook subscriptions for your organization.</p>
        </div>

        {/* API base */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">API endpoint</CardTitle>
            <CardDescription>Authenticate with <code className="px-1 bg-muted rounded">Authorization: Bearer &lt;your_api_key&gt;</code></CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 p-2 bg-muted rounded font-mono text-xs">
              <code className="flex-1 truncate">{apiBase}</code>
              <Button size="icon" variant="ghost" onClick={() => copy(apiBase)}><Copy className="h-3 w-3" /></Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Routes: <code>/events</code>, <code>/events/:id/tiers</code>, <code>/events/:id/orders</code>, <code>/checkin</code>, <code>/webhooks</code>.</p>
          </CardContent>
        </Card>

        {/* API Keys */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />API keys</CardTitle>
            <CardDescription>Keys are shown only once at creation — copy and store them securely.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input placeholder="Key name (e.g. Production server)" value={keyName} onChange={(e) => setKeyName(e.target.value)} />
              <Button onClick={() => createKey.mutate()} disabled={createKey.isPending} className="gap-2">
                <Plus className="h-4 w-4" />Create
              </Button>
            </div>
            <div className="border border-border rounded-lg divide-y divide-border">
              {(keys.data || []).length === 0 && <p className="text-sm text-muted-foreground p-4">No API keys yet.</p>}
              {(keys.data || []).map((k: any) => (
                <div key={k.id} className="flex items-center justify-between p-3 gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{k.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{k.prefix}•••• · created {format(new Date(k.created_at), "MMM d, yyyy")}{k.last_used_at && ` · last used ${format(new Date(k.last_used_at), "MMM d")}`}</p>
                  </div>
                  {k.revoked_at ? <Badge variant="secondary">Revoked</Badge> :
                    <Button size="sm" variant="ghost" onClick={() => revokeKey.mutate(k.id)}>Revoke</Button>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Webhooks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2"><Webhook className="h-5 w-5" />Webhook endpoints</CardTitle>
              <CardDescription>Receive signed events when orders are paid or tickets checked in.</CardDescription>
            </div>
            <Button size="sm" onClick={() => setHookOpen(true)} className="gap-2"><Plus className="h-4 w-4" />Add endpoint</Button>
          </CardHeader>
          <CardContent>
            <div className="border border-border rounded-lg divide-y divide-border">
              {(endpoints.data || []).length === 0 && <p className="text-sm text-muted-foreground p-4">No endpoints registered.</p>}
              {(endpoints.data || []).map((e: any) => (
                <div key={e.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs truncate">{e.url}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(e.events || []).map((ev: string) => <Badge key={ev} variant="outline" className="text-[10px]">{ev}</Badge>)}
                      {!e.is_active && <Badge variant="secondary" className="text-[10px]">Disabled</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => toggleHook.mutate({ id: e.id, is_active: !e.is_active })}>{e.is_active ? "Disable" : "Enable"}</Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteHook.mutate(e.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>

            {(recentDeliveries.data || []).length > 0 && (
              <div className="mt-6">
                <p className="text-sm font-medium mb-2">Recent deliveries</p>
                <div className="border border-border rounded-lg divide-y divide-border text-xs">
                  {recentDeliveries.data!.map((d: any) => (
                    <div key={d.id} className="p-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{d.event_type}</p>
                        <p className="text-muted-foreground">{format(new Date(d.created_at), "MMM d, HH:mm")} · {d.attempts} attempt(s){d.last_error && ` · ${d.last_error.slice(0, 60)}`}</p>
                      </div>
                      <Badge variant={d.status === "delivered" ? "default" : d.status === "failed" ? "destructive" : "secondary"}>{d.status}{d.response_status ? ` ${d.response_status}` : ""}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reveal new API key */}
      <Dialog open={!!revealedKey} onOpenChange={(o) => !o && setRevealedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your new API key</DialogTitle>
            <DialogDescription className="flex items-start gap-2 text-warning"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />This is the only time you'll see this key. Copy it now.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 p-3 bg-muted rounded font-mono text-xs break-all">
            <code className="flex-1">{revealedKey}</code>
            <Button size="icon" variant="ghost" onClick={() => copy(revealedKey!, "API key copied")}><Copy className="h-3 w-3" /></Button>
          </div>
          <DialogFooter><Button onClick={() => setRevealedKey(null)}>I've stored it safely</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New webhook dialog */}
      <Dialog open={hookOpen} onOpenChange={setHookOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add webhook endpoint</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Endpoint URL</Label><Input value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} placeholder="https://api.yourapp.com/webhooks/eventsuite" /></div>
            <div className="space-y-1.5"><Label>Description (optional)</Label><Input value={hookDesc} onChange={(e) => setHookDesc(e.target.value)} placeholder="Production CRM sync" /></div>
            <div className="space-y-2">
              <Label>Events to subscribe</Label>
              {EVENT_TYPES.map((ev) => (
                <label key={ev} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={hookEvents.includes(ev)} onCheckedChange={(c) => setHookEvents((p) => c ? [...new Set([...p, ev])] : p.filter((x) => x !== ev))} />
                  <code>{ev}</code>
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHookOpen(false)}>Cancel</Button>
            <Button onClick={() => createHook.mutate()} disabled={createHook.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reveal webhook secret */}
      <Dialog open={!!revealedSecret} onOpenChange={(o) => !o && setRevealedSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Webhook secret</DialogTitle>
            <DialogDescription>Use this secret to verify the <code>X-EnventSuite-Signature</code> header (HMAC-SHA256 of the raw body). Note: the header keeps its legacy <code>EnventSuite</code> prefix for backward compatibility with existing integrations.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">URL</p>
            <div className="font-mono text-xs p-2 bg-muted rounded break-all">{revealedSecret?.url}</div>
            <p className="text-xs text-muted-foreground">Signing secret</p>
            <div className="flex items-center gap-2 p-2 bg-muted rounded font-mono text-xs break-all">
              <code className="flex-1">{revealedSecret?.secret}</code>
              <Button size="icon" variant="ghost" onClick={() => copy(revealedSecret!.secret, "Secret copied")}><Copy className="h-3 w-3" /></Button>
            </div>
          </div>
          <DialogFooter><Button onClick={() => setRevealedSecret(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Developer;
