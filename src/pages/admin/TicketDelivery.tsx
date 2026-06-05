import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MailCheck, RefreshCw } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import EmptyState from "@/components/EmptyState";
import TicketPreviewCard from "@/components/TicketPreviewCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

const TicketDelivery = () => {
  const { roles, loading } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");

  const { data: orders, isLoading, refetch } = useQuery({
    queryKey: ["admin-ticket-delivery"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*,events(title,starts_at,venue,city),tickets(*,ticket_tiers(name))")
        .eq("status", "paid")
        .order("paid_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  if (loading) return null;
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;

  const tickets = (orders || []).flatMap((order: any) =>
    (order.tickets || []).map((ticket: any) => ({ ticket, order, event: order.events })),
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><MailCheck className="h-6 w-6 text-primary" />Tickets to send</h1>
            <p className="text-sm text-muted-foreground">Download or print confirmed tickets for manual email delivery.</p>
          </div>
          <Button variant="outline" className="gap-2" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />Refresh
          </Button>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-lg">Paid tickets ready for delivery</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading tickets…</p>
            ) : tickets.length === 0 ? (
              <EmptyState icon={<MailCheck className="h-5 w-5" />} title="No paid tickets yet" description="Paid orders will appear here for manual delivery." />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {tickets.map(({ ticket, order, event }: any) => (
                  <TicketPreviewCard key={ticket.id} ticket={ticket} event={event} order={order} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default TicketDelivery;