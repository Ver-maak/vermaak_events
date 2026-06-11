import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import EmptyState from "@/components/EmptyState";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Ticket, Calendar, MapPin, ArrowRight } from "lucide-react";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useAuth } from "@/lib/auth";

const MyTickets = () => {
  const { user } = useAuth();
  const { data: orders, isLoading } = useQuery({
    queryKey: ["my-orders-full", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("*,events(title,slug,starts_at,venue,city,cover_image_url),tickets(id,code,holder_name,checked_in_at)")
        .eq("buyer_id", user!.id)
        .eq("status", "paid")
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">My tickets</h1>
          <p className="text-muted-foreground">All your orders and tickets in one place</p>
        </div>

        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
          !orders || orders.length === 0 ? (
            <EmptyState icon={<Ticket className="h-5 w-5" />} title="No tickets yet" description="Browse events to grab your first ticket." action={<Link to="/events"><Button>Browse events</Button></Link>} />
          ) : (
            <div className="space-y-4">
              {orders.map((o: any) => (
                <Card key={o.id} className="overflow-hidden">
                  <div className="flex flex-col md:flex-row">
                    <div className="md:w-48 aspect-video md:aspect-auto bg-muted flex-shrink-0">
                      {o.events?.cover_image_url ? <img src={o.events.cover_image_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full gradient-accent flex items-center justify-center"><Calendar className="h-8 w-8 text-white/60" /></div>}
                    </div>
                    <div className="p-5 flex-1 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold text-lg">{o.events?.title}</h3>
                            <p className="text-xs text-muted-foreground">{o.reference}</p>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${o.status === "paid" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>{o.status}</span>
                        </div>
                        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mt-2">
                          <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatDateTime(o.events?.starts_at)}</span>
                          <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{o.events?.venue || o.events?.city || "TBA"}</span>
                          <span className="flex items-center gap-1"><Ticket className="h-3.5 w-3.5" />{o.tickets?.length || 0} ticket{o.tickets?.length === 1 ? "" : "s"}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold">{formatMoney(Number(o.total_amount), o.currency)}</p>
                        <div className="flex items-center gap-2">
                          {o.status === "pending" && Number(o.total_amount) > 0 && (
                            <Link to={`/dashboard/orders/${o.id}`}><Button size="sm" className="gap-1">Complete payment</Button></Link>
                          )}
                          <Link to={`/dashboard/orders/${o.id}`}><Button size="sm" variant="outline" className="gap-1">View tickets <ArrowRight className="h-3.5 w-3.5" /></Button></Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
      </div>
    </DashboardLayout>
  );
};

export default MyTickets;
