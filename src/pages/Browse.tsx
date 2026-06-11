import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Search } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { formatDateTime } from "@/lib/format";
import EmptyState from "@/components/EmptyState";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/ThemeToggle";

const Browse = () => {
  const { session } = useAuth();
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");

  const { data: events, isLoading } = useQuery({
    queryKey: ["public-events", q, city],
    queryFn: async () => {
      let query = supabase.from("events").select("*")
        .eq("status", "published")
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true });
      if (q) query = query.ilike("title", `%${q}%`);
      if (city) query = query.ilike("city", `%${city}%`);
      const { data } = await query;
      return data || [];
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <BrandLogo className="h-8 w-8" />
            <span className="font-bold">EventSuite</span>
            <span className="hidden sm:inline text-[11px] text-muted-foreground ml-1">by Vermaak</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {session ? <Link to="/dashboard"><Button variant="outline" size="sm">Dashboard</Button></Link>
              : <Link to="/auth"><Button size="sm">Sign in</Button></Link>}
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Discover events</h1>
          <p className="text-muted-foreground">Find what's happening near you</p>
        </div>

        <div className="flex flex-col md:flex-row gap-3 mb-8">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search events…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <Input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} className="md:w-56" />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => <div key={i} className="h-72 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : !events || events.length === 0 ? (
          <EmptyState icon={<Calendar className="h-5 w-5" />} title="No events found" description="Try different search terms or check back soon." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((e) => (
              <Link key={e.id} to={`/events/${e.slug}`} className="group rounded-xl overflow-hidden border border-border bg-card hover:shadow-elevated transition-all">
                <div className="aspect-[16/10] bg-muted overflow-hidden">
                  {e.cover_image_url ? <img src={e.cover_image_url} alt={e.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    : <div className="w-full h-full gradient-accent flex items-center justify-center"><Calendar className="h-12 w-12 text-white/60" /></div>}
                </div>
                <div className="p-5">
                  <div className="text-xs text-primary font-medium mb-2">{formatDateTime(e.starts_at)}</div>
                  <h3 className="font-semibold text-lg mb-2 line-clamp-2">{e.title}</h3>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{e.venue || e.city || "TBA"}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Browse;
