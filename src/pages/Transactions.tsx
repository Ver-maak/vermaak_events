import DashboardLayout from "@/components/DashboardLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeftRight } from "lucide-react";

const formatCurrency = (amount: number, currency = "UGX") => {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
};

const statusColor = (status: string) => {
  switch (status) {
    case "completed": return "bg-success/10 text-success border-success/20";
    case "failed": return "bg-destructive/10 text-destructive border-destructive/20";
    case "pending": return "bg-warning/10 text-warning border-warning/20";
    default: return "bg-muted text-muted-foreground";
  }
};

const Transactions = () => {
  const { data: transactions, isLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Transactions</h1>
          <p className="text-muted-foreground">View all your transaction history</p>
        </div>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">Transaction History</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : transactions && transactions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-xs font-medium text-muted-foreground pb-3">Reference</th>
                      <th className="text-left text-xs font-medium text-muted-foreground pb-3">Type</th>
                      <th className="text-left text-xs font-medium text-muted-foreground pb-3">Amount</th>
                      <th className="text-left text-xs font-medium text-muted-foreground pb-3">Status</th>
                      <th className="text-left text-xs font-medium text-muted-foreground pb-3">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="border-b border-border last:border-0">
                        <td className="py-3 text-sm font-mono">{tx.reference || "-"}</td>
                        <td className="py-3">
                          <span className="text-sm capitalize">{tx.type}</span>
                        </td>
                        <td className="py-3 text-sm font-medium">{formatCurrency(Number(tx.amount), tx.currency)}</td>
                        <td className="py-3">
                          <Badge variant="outline" className={statusColor(tx.status)}>
                            {tx.status}
                          </Badge>
                        </td>
                        <td className="py-3 text-sm text-muted-foreground">
                          {new Date(tx.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center">
                <ArrowLeftRight className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-1">No transactions</h3>
                <p className="text-sm text-muted-foreground">Transactions will appear here once you start making transfers.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Transactions;
