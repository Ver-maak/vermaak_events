import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import StatCard from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { Calendar, DollarSign, Ticket, Users } from "lucide-react";
import { formatMoney, formatDateTime } from "@/lib/format";
import { Link } from "react-router-dom";

const Analytics = () => {
  const { user, roles } = useAuth();
  const isSuper = roles.includes("super_admin");

  const { data } = useQuery({
    queryKey: ["analytics-overview", user?.id, isSuper],
    enabled: !!user?.id,
    queryFn: async () => {
      let eq = supabase.from("events").select("id,title,starts_at,currency,status");
      if (!isSuper) eq = eq.eq("organizer_id", user!.id);
      const { data: events } = await eq;
      const ids = (events || []).map((e) => e.id);
      if (ids.length === 0) return { events: [], stats: { revenue: 0, orders: 0, tickets: 0, checkedIn: 0 }, perEvent: [] };

      const [{ data: orders }, { data: tickets }] = await Promise.all([
        supabase.from("orders").select("event_id,total_amount,status").in("event_id", ids),
        supabase.from("tickets").select("event_id,checked_in_at").in("event_id", ids),
      ]);

      const paid = (orders || []).filter((o) => o.status === "paid");
      const revenue = paid.reduce((s, o) => s + Number(o.total_amount || 0), 0);

      const perEvent = (events || []).map((e) => {
        const er = paid.filter((o) => o.event_id === e.id).reduce((s, o) => s + Number(o.total_amount), 0);
        const et = (tickets || []).filter((t) => t.event_id === e.id);
        return { ...e, revenue: er, tickets: et.length, checkedIn: et.filter((t) => t.checked_in_at).length };
      });

      return {
        events,
        stats: { revenue, orders: orders?.length || 0, tickets: tickets?.length || 0, checkedIn: (tickets || []).filter((t) => t.checked_in_at).length },
        perEvent,
      };
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Revenue, attendance and performance across your events</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total revenue" value={formatMoney(data?.stats.revenue || 0)} icon={<DollarSign className="h-5 w-5" />} />
          <StatCard title="Events" value={data?.events.length || 0} icon={<Calendar className="h-5 w-5" />} />
          <StatCard title="Tickets sold" value={data?.stats.tickets || 0} icon={<Ticket className="h-5 w-5" />} />
          <StatCard title="Checked in" value={data?.stats.checkedIn || 0} icon={<Users className="h-5 w-5" />} />
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Per event</CardTitle></CardHeader>
          <CardContent>
            {!data?.perEvent.length ? <p className="text-sm text-muted-foreground py-6 text-center">No events yet</p> :
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground text-xs uppercase">
                    <tr><th className="py-2">Event</th><th>Date</th><th>Status</th><th>Tickets</th><th>Checked in</th><th>Revenue</th></tr>
                  </thead>
                  <tbody>
                    {data.perEvent.map((e: any) => (
                      <tr key={e.id} className="border-t border-border">
                        <td className="py-2"><Link to={`/dashboard/events/${e.id}`} className="font-medium hover:text-primary">{e.title}</Link></td>
                        <td className="text-muted-foreground">{formatDateTime(e.starts_at)}</td>
                        <td className="capitalize text-xs">{e.status}</td>
                        <td>{e.tickets}</td>
                        <td>{e.checkedIn}</td>
                        <td className="font-medium">{formatMoney(e.revenue, e.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Analytics;
