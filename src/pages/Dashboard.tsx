import { useAuth } from "@/lib/auth";
import DashboardLayout from "@/components/DashboardLayout";
import StatCard from "@/components/StatCard";
import EmptyState from "@/components/EmptyState";
import { Calendar, Ticket, Users, DollarSign, Sparkles, ArrowRight, CheckCircle2, Circle, Building2, QrCode, BarChart3, Code2, Plus, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { formatMoney, formatDateTime } from "@/lib/format";
import { toast } from "@/hooks/use-toast";

const Dashboard = () => {
  const { roles, profile, user } = useAuth();
  const qc = useQueryClient();
  const isSuperAdmin = roles.includes("super_admin");
  const isOrganizer = roles.includes("organizer") || isSuperAdmin;
  const isAttendee = roles.includes("attendee") && !isOrganizer;

  const { data: myEvents } = useQuery({
    queryKey: ["my-events", user?.id],
    enabled: !!user?.id && isOrganizer,
    queryFn: async () => {
      const { data } = await supabase.from("events").select("*").eq("organizer_id", user!.id).order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: myOrders } = useQuery({
    queryKey: ["my-orders", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("*,events(title,starts_at)").eq("buyer_id", user!.id).order("created_at", { ascending: false }).limit(5);
      return data || [];
    },
  });

  const { data: orgStats } = useQuery({
    queryKey: ["org-stats", user?.id],
    enabled: isOrganizer && !!myEvents && myEvents.length > 0,
    queryFn: async () => {
      const eventIds = myEvents!.map((e) => e.id);
      const [{ data: orders }, { data: tickets }] = await Promise.all([
        supabase.from("orders").select("total_amount,status").in("event_id", eventIds),
        supabase.from("tickets").select("id,checked_in_at").in("event_id", eventIds),
      ]);
      const revenue = (orders || []).filter((o) => o.status === "paid").reduce((s, o) => s + Number(o.total_amount || 0), 0);
      const ticketsSold = (tickets || []).length;
      const checkedIn = (tickets || []).filter((t) => t.checked_in_at).length;
      return { revenue, ticketsSold, checkedIn };
    },
  });

  const becomeOrganizer = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("user_roles").insert({ user_id: user.id, role: "organizer" as any });
      if (error && !error.message.includes("duplicate")) throw error;
    },
    onSuccess: () => {
      toast({ title: "You're now an organizer!", description: "Create your first event." });
      window.location.reload();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const checklist = [
    { done: !!profile?.full_name, label: "Complete your profile", href: "/dashboard/settings" },
    { done: isOrganizer, label: "Become an organizer", action: () => becomeOrganizer.mutate() },
    { done: !!myEvents && myEvents.length > 0, label: "Create your first event", href: "/dashboard/events/new" },
    { done: !!myEvents?.some((e) => e.status === "published"), label: "Publish an event", href: "/dashboard/events" },
  ];
  const incomplete = checklist.filter((c) => !c.done);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Welcome back{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}</h1>
          <p className="text-muted-foreground">{isOrganizer ? "Here's what's happening with your events." : "Discover events and manage your tickets."}</p>
        </div>

        {/* Onboarding checklist */}
        {incomplete.length > 0 && (
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Get started</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {checklist.map((c, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-1">
                  <div className="flex items-center gap-2 text-sm">
                    {c.done ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                    <span className={c.done ? "text-muted-foreground line-through" : ""}>{c.label}</span>
                  </div>
                  {!c.done && (c.href ? (
                    <Link to={c.href}><Button size="sm" variant="ghost">Go <ArrowRight className="h-3 w-3" /></Button></Link>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={c.action} disabled={becomeOrganizer.isPending}>Enable</Button>
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Organizer stats */}
        {isOrganizer && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Events" value={myEvents?.length || 0} subtitle="Total" icon={<Calendar className="h-5 w-5" />} />
            <StatCard title="Tickets sold" value={orgStats?.ticketsSold || 0} subtitle="All time" icon={<Ticket className="h-5 w-5" />} />
            <StatCard title="Checked in" value={orgStats?.checkedIn || 0} subtitle="Attendees" icon={<Users className="h-5 w-5" />} />
            <StatCard title="Revenue" value={formatMoney(orgStats?.revenue || 0)} subtitle="Paid orders" icon={<DollarSign className="h-5 w-5" />} />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {isOrganizer && (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-lg">Your events</CardTitle>
                <Link to="/dashboard/events/new"><Button size="sm">+ New event</Button></Link>
              </CardHeader>
              <CardContent>
                {!myEvents ? <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p> :
                  myEvents.length === 0 ? <EmptyState icon={<Calendar className="h-5 w-5" />} title="No events yet" description="Create your first event to start selling tickets." action={<Link to="/dashboard/events/new"><Button>Create event</Button></Link>} /> :
                  <div className="space-y-2">
                    {myEvents.slice(0, 5).map((e) => (
                      <Link key={e.id} to={`/dashboard/events/${e.id}`} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{e.title}</p>
                          <p className="text-xs text-muted-foreground">{formatDateTime(e.starts_at)}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${e.status === "published" ? "bg-success/10 text-success" : e.status === "draft" ? "bg-muted text-muted-foreground" : "bg-warning/10 text-warning"}`}>{e.status}</span>
                      </Link>
                    ))}
                  </div>}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg">Recent orders</CardTitle>
              <Link to="/dashboard/my-tickets"><Button size="sm" variant="ghost">View all</Button></Link>
            </CardHeader>
            <CardContent>
              {!myOrders || myOrders.length === 0 ?
                <EmptyState icon={<Ticket className="h-5 w-5" />} title="No tickets yet" description="Browse upcoming events to grab your first ticket." action={<Link to="/events"><Button>Browse events</Button></Link>} /> :
                <div className="space-y-2">
                  {myOrders.map((o: any) => (
                    <div key={o.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{o.events?.title || "Event"}</p>
                        <p className="text-xs text-muted-foreground">{o.reference}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{formatMoney(Number(o.total_amount), o.currency)}</p>
                        <p className={`text-xs capitalize ${o.status === "paid" ? "text-success" : "text-warning"}`}>{o.status}</p>
                      </div>
                    </div>
                  ))}
                </div>}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
