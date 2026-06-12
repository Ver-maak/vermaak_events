import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Plus, Users, Ticket, Shield } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { useAuth } from "@/lib/auth";

const OrganizerEvents = () => {
  const { user, roles, adminEventIds } = useAuth();
  const isSuper = roles.includes("super_admin");
  const isOrganizer = roles.includes("organizer") || isSuper;
  const { data: events, isLoading } = useQuery({
    queryKey: ["organizer-events", user?.id, isSuper, adminEventIds.join(",")],
    enabled: !!user?.id,
    queryFn: async () => {
      let q = supabase.from("events").select("*,tickets(count),orders(count)").order("created_at", { ascending: false });
      if (isSuper) {
        // no filter
      } else if (isOrganizer && adminEventIds.length > 0) {
        q = q.or(`organizer_id.eq.${user!.id},id.in.(${adminEventIds.join(",")})`);
      } else if (isOrganizer) {
        q = q.eq("organizer_id", user!.id);
      } else if (adminEventIds.length > 0) {
        q = q.in("id", adminEventIds);
      } else {
        return [];
      }
      const { data } = await q;
      return data || [];
    },
  });


  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{isOrganizer ? "My events" : "Managed events"}</h1>
            <p className="text-muted-foreground">{isOrganizer ? "Create, manage and publish your events" : "Events you've been granted admin access to"}</p>
          </div>
          {isOrganizer && <Link to="/dashboard/events/new"><Button className="gap-2"><Plus className="h-4 w-4" />New event</Button></Link>}
        </div>


        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
          !events || events.length === 0 ? (
            <EmptyState icon={<Calendar className="h-5 w-5" />} title="No events yet" description="Create your first event in under a minute." action={<Link to="/dashboard/events/new"><Button>Create event</Button></Link>} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {events.map((e: any) => {
                const canManageAdmins = isSuper || e.organizer_id === user?.id;
                return (
                <div key={e.id} className="relative">
                  <Link to={`/dashboard/events/${e.id}`}>
                    <Card className="overflow-hidden hover:shadow-elevated transition-shadow h-full">
                      <div className="aspect-video bg-muted relative">
                        {e.cover_image_url ? <img src={e.cover_image_url} alt={e.title} className="w-full h-full object-cover" />
                          : <div className="w-full h-full gradient-accent flex items-center justify-center"><Calendar className="h-10 w-10 text-white/60" /></div>}
                        <span className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full font-medium uppercase ${e.status === "published" ? "bg-success text-success-foreground" : e.status === "draft" ? "bg-muted-foreground/80 text-white" : "bg-warning text-warning-foreground"}`}>{e.status}</span>
                      </div>
                      <CardContent className="p-4">
                        <p className="text-xs text-primary font-medium">{formatDateTime(e.starts_at)}</p>
                        <h3 className="font-semibold line-clamp-1 mt-1">{e.title}</h3>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                          <span className="flex items-center gap-1"><Ticket className="h-3 w-3" />{e.tickets?.[0]?.count || 0}</span>
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{e.orders?.[0]?.count || 0}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                  {canManageAdmins && (
                    <Link
                      to={`/dashboard/events/${e.id}?tab=admins`}
                      className="absolute bottom-3 right-3 inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-background/90 border border-border hover:bg-accent hover:text-accent-foreground transition-colors"
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      <Shield className="h-3 w-3" /> Admins
                    </Link>
                  )}
                </div>
                );
              })}
            </div>
          )}
      </div>
    </DashboardLayout>
  );
};

export default OrganizerEvents;
