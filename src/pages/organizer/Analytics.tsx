import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import StatCard from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { Calendar, DollarSign, Ticket, Users, Download, Loader2 } from "lucide-react";
import { formatMoney, formatDateTime } from "@/lib/format";
import { Link } from "react-router-dom";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";

const csvEscape = (v: any) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const downloadCsv = (filename: string, rows: (string | number | null)[][]) => {
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const Analytics = () => {
  const { user, roles, adminEventIds } = useAuth();
  const isSuper = roles.includes("super_admin");
  const isOrganizer = roles.includes("organizer") || isSuper;
  const [exporting, setExporting] = useState<string | null>(null);


  const exportAttendees = async (eventId: string, eventTitle: string) => {
    try {
      setExporting(eventId);
      const { data: tickets, error } = await supabase
        .from("tickets")
        .select("code,holder_name,holder_email,checked_in_at,checked_in_at,metadata,created_at,ticket_tiers(name),orders!inner(buyer_name,buyer_email,buyer_phone,status,payment_method,payment_reference,total_amount,paid_at)")
        .eq("event_id", eventId)
        .eq("orders.status", "paid")
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (!tickets || tickets.length === 0) {
        toast({ title: "No paid attendees yet", description: "There are no confirmed tickets to export." });
        return;
      }
      const header = [
        "Ticket code","Tier","Attendee name","Attendee email","Attendee type","Rotary club","Member ID",
        "Checked in","Checked in at","Buyer name","Buyer email","Buyer phone","Order status",
        "Payment method","Payment reference","Order total","Paid at",
      ];
      const rows: (string | number | null)[][] = [header];
      for (const t of tickets as any[]) {
        const m = t.metadata || {};
        const o = t.orders || {};
        rows.push([
          t.code,
          t.ticket_tiers?.name || "",
          t.holder_name || "",
          t.holder_email || "",
          m.attendee_type || "",
          m.rotary_club || "",
          m.member_id || "",
          t.checked_in_at ? "yes" : "no",
          t.checked_in_at || "",
          o.buyer_name || "",
          o.buyer_email || "",
          o.buyer_phone || "",
          o.status || "",
          o.payment_method || "",
          o.payment_reference || "",
          o.total_amount ?? "",
          o.paid_at || "",
        ]);
      }
      const safe = eventTitle.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60) || "event";
      downloadCsv(`attendees-${safe}-${new Date().toISOString().slice(0,10)}.csv`, rows);
      toast({ title: "Export ready", description: `${tickets.length} attendee${tickets.length === 1 ? "" : "s"} downloaded.` });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message || "Could not export attendees", variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const { data } = useQuery({
      queryKey: ["analytics-overview", user?.id, isSuper, adminEventIds.join(",")],
    enabled: !!user?.id,
    queryFn: async () => {
      let eq = supabase.from("events").select("id,title,starts_at,currency,status");
      if (isSuper) {
        // all events
      } else if (isOrganizer && adminEventIds.length > 0) {
        eq = eq.or(`organizer_id.eq.${user!.id},id.in.(${adminEventIds.join(",")})`);
      } else if (isOrganizer) {
        eq = eq.eq("organizer_id", user!.id);
      } else if (adminEventIds.length > 0) {
        eq = eq.in("id", adminEventIds);
      } else {
        return { events: [], stats: { revenue: 0, orders: 0, tickets: 0, checkedIn: 0 }, perEvent: [] };
      }
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
                    <tr><th className="py-2">Event</th><th>Date</th><th>Status</th><th>Tickets</th><th>Checked in</th><th>Revenue</th><th className="text-right">Attendees</th></tr>
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
                        <td className="text-right">
                          {isOrganizer ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              disabled={exporting === e.id || e.tickets === 0}
                              onClick={() => exportAttendees(e.id, e.title)}
                            >
                              {exporting === e.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Download className="h-3.5 w-3.5" />}
                              CSV
                            </Button>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
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
