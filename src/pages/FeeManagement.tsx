import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Plus, Edit, DollarSign, Percent, RefreshCw, Calculator } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const formatCurrency = (amount: number, currency = "UGX") => {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
};

const FeeManagement = () => {
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = roles.includes("super_admin");

  // Exchange rates
  const { data: rates, isLoading: ratesLoading } = useQuery({
    queryKey: ["exchange-rates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("exchange_rates").select("*").order("currency");
      if (error) throw error;
      return data;
    },
  });

  // Fee tiers
  const { data: tiers, isLoading: tiersLoading } = useQuery({
    queryKey: ["fee-tiers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fee_tiers").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  // Fee audit logs
  const { data: auditLogs } = useQuery({
    queryKey: ["fee-audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  // Rate update
  const [editingRate, setEditingRate] = useState<{ id: string; currency: string; rate: string } | null>(null);

  const updateRateMutation = useMutation({
    mutationFn: async ({ id, rate }: { id: string; rate: number }) => {
      const { error } = await supabase.from("exchange_rates").update({ rate_to_ugx: rate, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exchange-rates"] });
      setEditingRate(null);
      toast({ title: "Exchange rate updated" });
    },
    onError: (e: Error) => toast({ title: "Failed to update rate", description: e.message, variant: "destructive" }),
  });

  // Tier editing
  const [editingTier, setEditingTier] = useState<any>(null);
  const [tierDialogOpen, setTierDialogOpen] = useState(false);

  const saveTierMutation = useMutation({
    mutationFn: async (tier: any) => {
      const payload = {
        currency: tier.currency,
        min_amount: parseFloat(tier.min_amount),
        max_amount: tier.max_amount ? parseFloat(tier.max_amount) : null,
        fee_type: tier.fee_type,
        fee_value: parseFloat(tier.fee_value),
        min_fee: tier.min_fee ? parseFloat(tier.min_fee) : null,
        max_fee: tier.max_fee ? parseFloat(tier.max_fee) : null,
        tier_label: tier.tier_label,
        sort_order: parseInt(tier.sort_order),
        is_active: tier.is_active !== false,
      };
      if (tier.id) {
        const { error } = await supabase.from("fee_tiers").update({ ...payload, version: (tier.version || 1) + 1, updated_at: new Date().toISOString() }).eq("id", tier.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("fee_tiers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fee-tiers"] });
      setTierDialogOpen(false);
      setEditingTier(null);
      toast({ title: "Fee tier saved" });
    },
    onError: (e: Error) => toast({ title: "Failed to save tier", description: e.message, variant: "destructive" }),
  });

  // Organizations (for tenant-specific simulation)
  const { data: organizations } = useQuery({
    queryKey: ["organizations-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fee simulator state
  const [simAmount, setSimAmount] = useState<string>("");
  const [simCurrency, setSimCurrency] = useState<string>("UGX");
  const [simOrgId, setSimOrgId] = useState<string>("__global__");
  const [simResult, setSimResult] = useState<any>(null);

  const simulateMutation = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(simAmount);
      if (!amt || amt <= 0) throw new Error("Enter a positive amount");
      // Read-only preview: estimate-fee invokes calculate_transaction_fee (STABLE),
      // which does not write to fee_audit_logs. Logs are only written by transfer_funds.
      const { data, error } = await supabase.functions.invoke("estimate-fee", {
        body: {
          amount: amt,
          currency: simCurrency,
          organization_id: simOrgId === "__global__" ? null : simOrgId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => setSimResult(data),
    onError: (e: Error) => {
      setSimResult(null);
      toast({ title: "Calculation failed", description: e.message, variant: "destructive" });
    },
  });

  const resetSimulator = () => {
    setSimAmount("");
    setSimCurrency("UGX");
    setSimOrgId("__global__");
    setSimResult(null);
  };

    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h2 className="text-lg font-medium">Access Denied</h2>
          <p className="text-muted-foreground">Only super admins can manage fees and rates.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Fee Management</h1>
          <p className="text-muted-foreground">Manage exchange rates, fee tiers, and view audit logs</p>
        </div>

        <Tabs defaultValue="rates">
          <TabsList>
            <TabsTrigger value="rates">Exchange Rates</TabsTrigger>
            <TabsTrigger value="tiers">Fee Tiers</TabsTrigger>
            <TabsTrigger value="simulator">Simulator</TabsTrigger>
            <TabsTrigger value="audit">Audit Log</TabsTrigger>
          </TabsList>

          <TabsContent value="rates" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className="h-5 w-5" />
                  Exchange Rates (to UGX)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Currency</TableHead>
                      <TableHead>Rate (1 unit = X UGX)</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rates?.map((rate) => (
                      <TableRow key={rate.id}>
                        <TableCell className="font-medium">{rate.currency}</TableCell>
                        <TableCell>
                          {editingRate?.id === rate.id ? (
                            <div className="flex gap-2 items-center">
                              <Input
                                type="number"
                                value={editingRate.rate}
                                onChange={(e) => setEditingRate({ ...editingRate, rate: e.target.value })}
                                className="w-32"
                              />
                              <Button size="sm" onClick={() => updateRateMutation.mutate({ id: rate.id, rate: parseFloat(editingRate.rate) })}>
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingRate(null)}>Cancel</Button>
                            </div>
                          ) : (
                            <span>{Number(rate.rate_to_ugx).toLocaleString()}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(rate.updated_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {editingRate?.id !== rate.id && rate.currency !== "UGX" && (
                            <Button variant="ghost" size="sm" onClick={() => setEditingRate({ id: rate.id, currency: rate.currency, rate: String(rate.rate_to_ugx) })}>
                              <Edit className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tiers" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Percent className="h-5 w-5" />
                  Fee Tiers
                </CardTitle>
                <Dialog open={tierDialogOpen} onOpenChange={setTierDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1" onClick={() => setEditingTier({ currency: "UGX", min_amount: "", max_amount: "", fee_type: "flat", fee_value: "", min_fee: "", max_fee: "", tier_label: "", sort_order: "0", is_active: true })}>
                      <Plus className="h-4 w-4" /> Add Tier
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingTier?.id ? "Edit" : "Add"} Fee Tier</DialogTitle>
                    </DialogHeader>
                    {editingTier && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label>Min Amount</Label>
                            <Input type="number" value={editingTier.min_amount} onChange={(e) => setEditingTier({ ...editingTier, min_amount: e.target.value })} />
                          </div>
                          <div className="space-y-1">
                            <Label>Max Amount (empty = unlimited)</Label>
                            <Input type="number" value={editingTier.max_amount || ""} onChange={(e) => setEditingTier({ ...editingTier, max_amount: e.target.value })} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label>Fee Type</Label>
                            <Select value={editingTier.fee_type} onValueChange={(v) => setEditingTier({ ...editingTier, fee_type: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="flat">Flat</SelectItem>
                                <SelectItem value="percentage">Percentage</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label>Fee Value {editingTier.fee_type === "percentage" ? "(%)" : "(UGX)"}</Label>
                            <Input type="number" step="0.01" value={editingTier.fee_value} onChange={(e) => setEditingTier({ ...editingTier, fee_value: e.target.value })} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label>Min Fee (optional)</Label>
                            <Input type="number" value={editingTier.min_fee || ""} onChange={(e) => setEditingTier({ ...editingTier, min_fee: e.target.value })} />
                          </div>
                          <div className="space-y-1">
                            <Label>Max Fee / Cap (optional)</Label>
                            <Input type="number" value={editingTier.max_fee || ""} onChange={(e) => setEditingTier({ ...editingTier, max_fee: e.target.value })} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label>Tier Label</Label>
                            <Input value={editingTier.tier_label} onChange={(e) => setEditingTier({ ...editingTier, tier_label: e.target.value })} />
                          </div>
                          <div className="space-y-1">
                            <Label>Sort Order</Label>
                            <Input type="number" value={editingTier.sort_order} onChange={(e) => setEditingTier({ ...editingTier, sort_order: e.target.value })} />
                          </div>
                        </div>
                        <Button onClick={() => saveTierMutation.mutate(editingTier)} className="w-full" disabled={saveTierMutation.isPending}>
                          {saveTierMutation.isPending ? "Saving..." : "Save Tier"}
                        </Button>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tier</TableHead>
                      <TableHead>Range</TableHead>
                      <TableHead>Fee</TableHead>
                      <TableHead>Min/Max</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ver.</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tiers?.map((tier) => (
                      <TableRow key={tier.id}>
                        <TableCell className="font-medium text-sm">{tier.tier_label}</TableCell>
                        <TableCell className="text-sm">
                          {formatCurrency(Number(tier.min_amount))} – {tier.max_amount ? formatCurrency(Number(tier.max_amount)) : "∞"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={tier.fee_type === "flat" ? "default" : "secondary"}>
                            {tier.fee_type === "flat" ? formatCurrency(Number(tier.fee_value)) : `${tier.fee_value}%`}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {tier.min_fee ? `Min: ${formatCurrency(Number(tier.min_fee))}` : "—"}
                          {tier.max_fee ? ` / Max: ${formatCurrency(Number(tier.max_fee))}` : ""}
                        </TableCell>
                        <TableCell>
                          <Badge variant={tier.is_active ? "default" : "outline"}>
                            {tier.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">v{tier.version}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => {
                            setEditingTier({
                              ...tier,
                              min_amount: String(tier.min_amount),
                              max_amount: tier.max_amount ? String(tier.max_amount) : "",
                              fee_value: String(tier.fee_value),
                              min_fee: tier.min_fee ? String(tier.min_fee) : "",
                              max_fee: tier.max_fee ? String(tier.max_fee) : "",
                              sort_order: String(tier.sort_order),
                            });
                            setTierDialogOpen(true);
                          }}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="simulator" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5" />
                  Fee Simulator
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Preview fee calculations without making transfers. Read-only — no audit logs are written.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Amount</Label>
                    <Input
                      type="number"
                      placeholder="e.g. 150000"
                      value={simAmount}
                      onChange={(e) => setSimAmount(e.target.value)}
                      min="0"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Currency</Label>
                    <Select value={simCurrency} onValueChange={setSimCurrency}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {rates?.map((r) => (
                          <SelectItem key={r.id} value={r.currency}>{r.currency}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Organization (optional)</Label>
                    <Select value={simOrgId} onValueChange={setSimOrgId}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__global__">Global pricing</SelectItem>
                        {organizations?.map((o) => (
                          <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => simulateMutation.mutate()}
                    disabled={simulateMutation.isPending || !simAmount || parseFloat(simAmount) <= 0}
                  >
                    {simulateMutation.isPending ? "Calculating..." : "Calculate Fee"}
                  </Button>
                  <Button variant="ghost" onClick={resetSimulator}>Reset</Button>
                </div>

                {simResult && (
                  <Card className="bg-muted/30 border-dashed">
                    <CardContent className="pt-6 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Matched Tier</span>
                        <Badge>{simResult.tier_label}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="space-y-1">
                          <div className="text-muted-foreground">Amount</div>
                          <div className="font-medium">{formatCurrency(parseFloat(simAmount), simCurrency)}</div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-muted-foreground">Fee ({simCurrency})</div>
                          <div className="font-medium text-primary">{formatCurrency(Number(simResult.fee), simCurrency)}</div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-muted-foreground">Fee (UGX equivalent)</div>
                          <div className="font-medium">{formatCurrency(Number(simResult.fee_ugx))}</div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-muted-foreground">Net Received</div>
                          <div className="font-medium">{formatCurrency(Number(simResult.net_amount), simCurrency)}</div>
                        </div>
                        {simCurrency !== "UGX" && (
                          <>
                            <div className="space-y-1">
                              <div className="text-muted-foreground">Exchange Rate</div>
                              <div className="font-medium">1 {simCurrency} = {Number(simResult.exchange_rate).toLocaleString()} UGX</div>
                            </div>
                            <div className="space-y-1">
                              <div className="text-muted-foreground">UGX Equivalent</div>
                              <div className="font-medium">{formatCurrency(Number(simResult.ugx_equivalent))}</div>
                            </div>
                          </>
                        )}
                        <div className="space-y-1">
                          <div className="text-muted-foreground">Fee Type</div>
                          <div className="font-medium capitalize">
                            {simResult.fee_type} {simResult.fee_type === "percentage" ? `(${simResult.fee_value}%)` : ""}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-muted-foreground">Effective Rate</div>
                          <div className="font-medium">
                            {((Number(simResult.fee) / parseFloat(simAmount)) * 100).toFixed(3)}%
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="mt-4">

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Fee Audit Log
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead>Fee</TableHead>
                      <TableHead>Fee (UGX)</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead>Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs?.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No fee calculations logged yet</TableCell>
                      </TableRow>
                    )}
                    {auditLogs?.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm">{new Date(log.created_at).toLocaleString()}</TableCell>
                        <TableCell>{formatCurrency(Number(log.original_amount), log.original_currency)}</TableCell>
                        <TableCell>{log.original_currency}</TableCell>
                        <TableCell>{formatCurrency(Number(log.fee_original_currency), log.original_currency)}</TableCell>
                        <TableCell>{formatCurrency(Number(log.fee_ugx))}</TableCell>
                        <TableCell className="text-sm">{log.tier_label}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{log.exchange_rate ? `×${Number(log.exchange_rate).toLocaleString()}` : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default FeeManagement;
