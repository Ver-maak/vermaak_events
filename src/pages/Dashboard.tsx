import { useAuth } from "@/lib/auth";
import DashboardLayout from "@/components/DashboardLayout";
import StatCard from "@/components/StatCard";
import { Wallet, ArrowLeftRight, Users, Building2, TrendingUp, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const Dashboard = () => {
  const { roles, profile } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");

  const { data: wallets } = useQuery({
    queryKey: ["wallets"],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("*");
      return data || [];
    },
  });

  const { data: transactions } = useQuery({
    queryKey: ["recent-transactions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
  });

  const { data: orgs } = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      const { data } = await supabase.from("organizations").select("*");
      return data || [];
    },
    enabled: isSuperAdmin,
  });

  const totalBalance = wallets?.reduce((sum, w) => sum + Number(w.balance), 0) || 0;

  const formatCurrency = (amount: number, currency = "UGX") => {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">
            Welcome back, {profile?.full_name || "User"}
          </h1>
          <p className="text-muted-foreground">
            {isSuperAdmin ? "Platform overview" : "Your account overview"}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Balance"
            value={formatCurrency(totalBalance)}
            icon={<DollarSign className="h-5 w-5" />}
            trend={{ value: 12, label: "vs last month" }}
          />
          <StatCard
            title="Wallets"
            value={wallets?.length || 0}
            subtitle="Active wallets"
            icon={<Wallet className="h-5 w-5" />}
          />
          <StatCard
            title="Transactions"
            value={transactions?.length || 0}
            subtitle="Recent"
            icon={<ArrowLeftRight className="h-5 w-5" />}
          />
          {isSuperAdmin ? (
            <StatCard
              title="Organizations"
              value={orgs?.length || 0}
              subtitle="Active tenants"
              icon={<Building2 className="h-5 w-5" />}
            />
          ) : (
            <StatCard
              title="Growth"
              value="+12%"
              subtitle="This month"
              icon={<TrendingUp className="h-5 w-5" />}
            />
          )}
        </div>

        {/* Recent transactions */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            {transactions && transactions.length > 0 ? (
              <div className="space-y-3">
                {transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium ${
                        tx.type === "transfer" ? "bg-primary/10 text-primary" :
                        tx.type === "deposit" ? "bg-success/10 text-success" :
                        "bg-destructive/10 text-destructive"
                      }`}>
                        {tx.type.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium capitalize">{tx.type}</p>
                        <p className="text-xs text-muted-foreground">{tx.description || tx.reference}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{formatCurrency(Number(tx.amount), tx.currency)}</p>
                      <p className={`text-xs capitalize ${
                        tx.status === "completed" ? "text-success" :
                        tx.status === "failed" ? "text-destructive" :
                        "text-warning"
                      }`}>{tx.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No transactions yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
