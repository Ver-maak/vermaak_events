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
import { toast } from "@/hooks/use-toast";
import { Wallet, Send, Plus, ArrowUpRight, ArrowDownRight } from "lucide-react";
import FeeBreakdown from "@/components/FeeBreakdown";
import type { Database } from "@/integrations/supabase/types";

type CurrencyCode = Database["public"]["Enums"]["currency_code"];

const CURRENCIES: CurrencyCode[] = ["UGX", "USD", "EUR", "GBP", "KES", "TZS", "RWF"];

const formatCurrency = (amount: number, currency = "UGX") => {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
};

const Wallets = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferData, setTransferData] = useState({ fromWalletId: "", toWalletId: "", amount: "", description: "" });

  const { data: wallets, isLoading } = useQuery({
    queryKey: ["wallets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("wallets").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: allWallets } = useQuery({
    queryKey: ["all-wallets-for-transfer"],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("*, profiles(full_name, email)");
      return data || [];
    },
  });

  const transferMutation = useMutation({
    mutationFn: async (data: { fromWalletId: string; toWalletId: string; amount: number; description: string }) => {
      const { error } = await supabase.rpc("transfer_funds", {
        _from_wallet_id: data.fromWalletId,
        _to_wallet_id: data.toWalletId,
        _amount: data.amount,
        _description: data.description || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["recent-transactions"] });
      setTransferOpen(false);
      setTransferData({ fromWalletId: "", toWalletId: "", amount: "", description: "" });
      toast({ title: "Transfer successful", description: "Funds have been transferred." });
    },
    onError: (error: Error) => {
      toast({ title: "Transfer failed", description: error.message, variant: "destructive" });
    },
  });

  const handleTransfer = () => {
    const amount = parseFloat(transferData.amount);
    if (!amount || amount <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    transferMutation.mutate({
      fromWalletId: transferData.fromWalletId,
      toWalletId: transferData.toWalletId,
      amount,
      description: transferData.description,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Wallets</h1>
            <p className="text-muted-foreground">Manage your wallets and transfers</p>
          </div>
          <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Send className="h-4 w-4" />
                Transfer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Transfer Funds</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>From Wallet</Label>
                  <Select value={transferData.fromWalletId} onValueChange={(v) => setTransferData(d => ({ ...d, fromWalletId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select wallet" /></SelectTrigger>
                    <SelectContent>
                      {wallets?.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.currency} — {formatCurrency(Number(w.balance), w.currency)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>To Wallet</Label>
                  <Select value={transferData.toWalletId} onValueChange={(v) => setTransferData(d => ({ ...d, toWalletId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select recipient wallet" /></SelectTrigger>
                    <SelectContent>
                      {allWallets?.filter(w => w.id !== transferData.fromWalletId).map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {(w as any).profiles?.full_name || (w as any).profiles?.email || w.user_id} — {w.currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={transferData.amount}
                    onChange={(e) => setTransferData(d => ({ ...d, amount: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Input
                    value={transferData.description}
                    onChange={(e) => setTransferData(d => ({ ...d, description: e.target.value }))}
                    placeholder="Payment for..."
                  />
                </div>
                <Button onClick={handleTransfer} className="w-full" disabled={transferMutation.isPending}>
                  {transferMutation.isPending ? "Processing..." : "Send Transfer"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6 h-32" />
              </Card>
            ))}
          </div>
        ) : wallets && wallets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {wallets.map((wallet) => (
              <Card key={wallet.id} className="shadow-card hover:shadow-elevated transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="h-10 w-10 rounded-lg gradient-primary flex items-center justify-center">
                      <Wallet className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      wallet.is_active ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                    }`}>
                      {wallet.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{wallet.currency} Wallet</p>
                  <p className="text-2xl font-bold mt-1">{formatCurrency(Number(wallet.balance), wallet.currency)}</p>
                  <div className="flex gap-2 mt-4">
                    <Button variant="outline" size="sm" className="flex-1 gap-1">
                      <ArrowDownRight className="h-3 w-3" />
                      Deposit
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => {
                      setTransferData(d => ({ ...d, fromWalletId: wallet.id }));
                      setTransferOpen(true);
                    }}>
                      <ArrowUpRight className="h-3 w-3" />
                      Send
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="shadow-card">
            <CardContent className="py-12 text-center">
              <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-1">No wallets yet</h3>
              <p className="text-sm text-muted-foreground">Your wallets will appear here once created by your organization admin.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Wallets;
