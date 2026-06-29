import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeftRight, Receipt, Search, X } from "lucide-react";
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
type DateRange = "any" | "today" | "7d" | "30d" | "90d";

const Transactions = () => {
  const [orderFilter, setOrderFilter] = useState<OrderStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange>("any");
  const [minAmount, setMinAmount] = useState<string>("");
  const [maxAmount, setMaxAmount] = useState<string>("");

  const { data: orders, isLoading: ordersLoading, error: ordersError } = useQuery({
    queryKey: ["all-ticket-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, buyer_name, buyer_email, buyer_phone, status, total_amount, currency, payment_method, payment_reference, created_at, paid_at, event_id")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      const eventIds = Array.from(new Set((data ?? []).map((o: any) => o.event_id).filter(Boolean)));
      let eventMap: Record<string, string> = {};
      if (eventIds.length) {
        const { data: evs } = await supabase.from("events").select("id, title").in("id", eventIds);
        eventMap = Object.fromEntries((evs ?? []).map((e: any) => [e.id, e.title]));
      }
      return (data ?? []).map((o: any) => ({ ...o, event_title: eventMap[o.event_id] ?? "—" }));
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

  const eventOptions = useMemo(() => {
    const map = new Map<string, string>();
    (orders ?? []).forEach((o: any) => o.event_id && map.set(o.event_id, o.event_title));
    return Array.from(map.entries());
  }, [orders]);

  const methodOptions = useMemo(() => {
    const set = new Set<string>();
    (orders ?? []).forEach((o: any) => o.payment_method && set.add(o.payment_method));
    return Array.from(set);
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const min = minAmount ? Number(minAmount) : null;
    const max = maxAmount ? Number(maxAmount) : null;
    const now = Date.now();
    const cutoff =
      dateRange === "today" ? now - 86_400_000 :
      dateRange === "7d" ? now - 7 * 86_400_000 :
      dateRange === "30d" ? now - 30 * 86_400_000 :
      dateRange === "90d" ? now - 90 * 86_400_000 : null;

    return (orders ?? []).filter((o: any) => {
      if (orderFilter !== "all" && o.status !== orderFilter) return false;
      if (eventFilter !== "all" && o.event_id !== eventFilter) return false;
      if (methodFilter !== "all" && (o.payment_method || "") !== methodFilter) return false;
      if (min !== null && Number(o.total_amount) < min) return false;
      if (max !== null && Number(o.total_amount) > max) return false;
      if (cutoff !== null) {
        const ts = new Date(o.paid_at || o.created_at).getTime();
        if (ts < cutoff) return false;
      }
      if (q) {
        const hay = [
          o.buyer_name, o.buyer_email, o.buyer_phone,
          o.payment_reference, o.payment_method, o.event_title, o.id,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, orderFilter, search, eventFilter, methodFilter, minAmount, maxAmount, dateRange]);

  const counts = useMemo(() => ({
    all: orders?.length ?? 0,
    paid: orders?.filter((o: any) => o.status === "paid").length ?? 0,
    pending: orders?.filter((o: any) => o.status === "pending").length ?? 0,
    cancelled: orders?.filter((o: any) => o.status === "cancelled").length ?? 0,
  }), [orders]);

  const clearFilters = () => {
    setSearch(""); setEventFilter("all"); setMethodFilter("all");
    setDateRange("any"); setMinAmount(""); setMaxAmount("");
  };

  const hasActiveFilters =
    search || eventFilter !== "all" || methodFilter !== "all" ||
    dateRange !== "any" || minAmount || maxAmount;

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
              <CardHeader className="space-y-4">
                <div className="flex flex-row items-center justify-between gap-3 flex-wrap">
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
                </div>

                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by name, email, phone, reference, event, or order ID"
                      className="pl-9"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                    <Select value={eventFilter} onValueChange={setEventFilter}>
                      <SelectTrigger><SelectValue placeholder="Event" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All events</SelectItem>
                        {eventOptions.map(([id, title]) => (
                          <SelectItem key={id} value={id}>{title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={methodFilter} onValueChange={setMethodFilter}>
                      <SelectTrigger><SelectValue placeholder="Method" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All methods</SelectItem>
                        {methodOptions.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
                      <SelectTrigger><SelectValue placeholder="Date range" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any date</SelectItem>
                        <SelectItem value="today">Last 24 hours</SelectItem>
                        <SelectItem value="7d">Last 7 days</SelectItem>
                        <SelectItem value="30d">Last 30 days</SelectItem>
                        <SelectItem value="90d">Last 90 days</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder="Min amount"
                      value={minAmount}
                      onChange={(e) => setMinAmount(e.target.value)}
                    />
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder="Max amount"
                      value={maxAmount}
                      onChange={(e) => setMaxAmount(e.target.value)}
                    />
                  </div>

                  {hasActiveFilters && (
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Showing {filteredOrders.length} of {counts.all} orders</span>
                      <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7">
                        <X className="h-3.5 w-3.5 mr-1" /> Clear filters
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {ordersError ? (
                  <div className="py-8 text-center text-sm text-destructive">
                    Failed to load orders: {(ordersError as Error).message}
                  </div>
                ) : ordersLoading ? (
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
                            <td className="py-3">{o.event_title}</td>
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
                    <h3 className="text-lg font-medium mb-1">No orders found</h3>
                    <p className="text-sm text-muted-foreground">
                      {hasActiveFilters ? "Try adjusting or clearing your filters." : "No ticket orders yet."}
                    </p>
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
