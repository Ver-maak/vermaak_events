import { useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeftRight, Receipt } from "lucide-react";
import { formatMoney, formatDateTime } from "@/lib/format";

const walletStatusColor = (status: string) => {
  switch (status) {
    case "completed": return "bg-success/10 text-success border-success/20";
    case "failed": return "bg-destructive/10 text-destructive border-destructive/20";
    case "pending": return "bg-warning/10 text-warning border-warning/20";
    default: return "bg-muted text-muted-foreground";
  }
};

const orderStatusColor = (status: string) => {
  switch (status) {
    case "paid": return "bg-success/10 text-success border-success/20";
    case "pending": return "bg-warning/10 text-warning border-warning/20";
    case "cancelled":
    case "refunded":
      return "bg-destructive/10 text-destructive border-destructive/20";
    default: return "bg-muted text-muted-foreground";
  }
};

type OrderStatusFilter = "all" | "paid" | "pending" | "cancelled";

const Transactions = () => {
  const [orderFilter, setOrderFilter] = useState<OrderStatusFilter>("all");

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ["all-ticket-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, buyer_name, buyer_email, buyer_phone, status, total_amount, currency, payment_method, payment_reference, created_at, paid_at, event_id, events:event_id(title)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: walletTx, isLoading: walletLoading } = useQuery({
    queryKey: ["wallet-transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredOrders = (orders ?? []).filter((o) =>
    orderFilter === "all" ? true : o.status === orderFilter
  );

  const counts = {
    all: orders?.length ?? 0,
    paid: orders?.filter((o) => o.status === "paid").length ?? 0,
    pending: orders?.filter((o) => o.status === "pending").length ?? 0,
    cancelled: orders?.filter((o) => o.status === "cancelled").length ?? 0,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Transactions</h1>
          <p className="text-muted-foreground">All ticket orders and wallet activity across the platform</p>
        </div>

        <Tabs defaultValue="orders" className="space-y-4">
          <TabsList>
            <TabsTrigger value="orders">Ticket orders</TabsTrigger>
            <TabsTrigger value="wallet">Wallet transactions</TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="space-y-4">
            <Card className="shadow-card">
              <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Receipt className="h-5 w-5" /> Ticket order history
                </CardTitle>
                <Tabs value={orderFilter} onValueChange={(v) => setOrderFilter(v as OrderStatusFilter)}>
                  <TabsList>
                    <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
                    <TabsTrigger value="paid">Paid ({counts.paid})</TabsTrigger>
                    <TabsTrigger value="pending">Pending ({counts.pending})</TabsTrigger>
                    <TabsTrigger value="cancelled">Cancelled ({counts.cancelled})</TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent>
                {ordersLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />
                    ))}
                  </div>
                ) : filteredOrders.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                          <th className="pb-3 font-medium">Order</th>
                          <th className="pb-3 font-medium">Event</th>
                          <th className="pb-3 font-medium">Buyer</th>
                          <th className="pb-3 font-medium">Amount</th>
                          <th className="pb-3 font-medium">Method</th>
                          <th className="pb-3 font-medium">Status</th>
                          <th className="pb-3 font-medium">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrders.map((o: any) => (
                          <tr key={o.id} className="border-b border-border last:border-0 align-top">
                            <td className="py-3 font-mono text-xs">
                              <Link to={`/orders/${o.id}`} className="hover:underline">{o.id.slice(0, 8)}</Link>
                            </td>
                            <td className="py-3">{o.events?.title ?? "—"}</td>
                            <td className="py-3">
                              <div className="font-medium">{o.buyer_name || "—"}</div>
                              <div className="text-xs text-muted-foreground">{o.buyer_email}</div>
                              {o.buyer_phone && <div className="text-xs text-muted-foreground">{o.buyer_phone}</div>}
                            </td>
                            <td className="py-3 font-medium">{formatMoney(Number(o.total_amount), o.currency)}</td>
                            <td className="py-3 text-xs">
                              <div className="capitalize">{o.payment_method || "—"}</div>
                              {o.payment_reference && (
                                <div className="text-muted-foreground font-mono">{o.payment_reference}</div>
                              )}
                            </td>
                            <td className="py-3">
                              <Badge variant="outline" className={orderStatusColor(o.status)}>{o.status}</Badge>
                            </td>
                            <td className="py-3 text-xs text-muted-foreground">{formatDateTime(o.paid_at || o.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-1">No orders</h3>
                    <p className="text-sm text-muted-foreground">No ticket orders match this filter.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="wallet">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ArrowLeftRight className="h-5 w-5" /> Wallet transaction history
                </CardTitle>
              </CardHeader>
              <CardContent>
                {walletLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />
                    ))}
                  </div>
                ) : walletTx && walletTx.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                          <th className="pb-3 font-medium">Reference</th>
                          <th className="pb-3 font-medium">Type</th>
                          <th className="pb-3 font-medium">Amount</th>
                          <th className="pb-3 font-medium">Status</th>
                          <th className="pb-3 font-medium">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {walletTx.map((tx: any) => (
                          <tr key={tx.id} className="border-b border-border last:border-0">
                            <td className="py-3 font-mono text-xs">{tx.reference || "-"}</td>
                            <td className="py-3 capitalize">{tx.type}</td>
                            <td className="py-3 font-medium">{formatMoney(Number(tx.amount), tx.currency)}</td>
                            <td className="py-3">
                              <Badge variant="outline" className={walletStatusColor(tx.status)}>{tx.status}</Badge>
                            </td>
                            <td className="py-3 text-xs text-muted-foreground">{formatDateTime(tx.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <ArrowLeftRight className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-1">No wallet transactions</h3>
                    <p className="text-sm text-muted-foreground">Wallet transfers will appear here.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Transactions;
