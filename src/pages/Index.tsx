import { Navigate, Link } from "react-router-dom";
import { BrandLogo } from "@/components/BrandLogo";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Calendar, Ticket, QrCode, BarChart3, ArrowRight, Sparkles, MapPin, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime, formatMoney } from "@/lib/format";

const Index = () => {
  const { session, loading } = useAuth();

  const { data: featured } = useQuery({
    queryKey: ["featured-events"],
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("id,title,slug,cover_image_url,venue,city,starts_at,currency")
        .eq("status", "published")
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(3);
      return data || [];
    },
  });

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">Loading…</div></div>;
  }
  if (session) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="absolute top-0 inset-x-0 z-20">
        <nav className="container mx-auto px-4 py-5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <BrandLogo className="h-9 w-9" />
            <span className="text-xl font-bold text-white">EventSuite</span>
            <span className="hidden sm:inline text-xs text-white/60 font-medium ml-1">by Vermaak</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/events"><Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white">Browse events</Button></Link>
            <Link to="/auth"><Button variant="outline" className="border-white/30 text-white hover:bg-white/10 bg-transparent">Sign in</Button></Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="gradient-hero min-h-[90vh] flex items-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 left-10 w-72 h-72 bg-primary rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent rounded-full blur-3xl" />
        </div>
        <div className="container mx-auto px-4 py-32 relative z-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur text-white/90 px-3 py-1.5 rounded-full text-sm mb-6">
              <Sparkles className="h-3.5 w-3.5" />
              Built for organizers in East Africa
            </div>
            <h1 className="text-5xl md:text-7xl font-bold text-white leading-[1.05] mb-6 text-balance">
              Run unforgettable<br /> <span className="bg-gradient-to-r from-primary-glow to-accent bg-clip-text text-transparent">events.</span>
            </h1>
            <p className="text-lg md:text-xl text-white/80 mb-10 max-w-2xl">
              Create events, sell tickets, check guests in with QR — and grow with real‑time analytics.
              EventSuite gives you everything you need, in one place.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link to="/auth"><Button size="lg" className="gap-2 w-full sm:w-auto h-12 px-6 text-base">Start for free <ArrowRight className="h-4 w-4" /></Button></Link>
              <Link to="/events"><Button size="lg" variant="outline" className="gap-2 w-full sm:w-auto h-12 px-6 text-base border-white/20 text-white hover:bg-white/10 bg-transparent">Browse events</Button></Link>
            </div>
          </div>
        </div>
      </section>

      {/* Featured events */}
      {featured && featured.length > 0 && (
        <section className="py-20 bg-background border-b border-border">
          <div className="container mx-auto px-4">
            <div className="flex items-end justify-between mb-8">
              <div>
                <h2 className="text-3xl font-bold mb-2">Upcoming events</h2>
                <p className="text-muted-foreground">Grab tickets before they sell out</p>
              </div>
              <Link to="/events" className="text-sm text-primary hover:underline">View all →</Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {featured.map((e) => (
                <Link key={e.id} to={`/events/${e.slug}`} className="group rounded-xl overflow-hidden border border-border bg-card hover:shadow-elevated transition-all">
                  <div className="aspect-[16/10] bg-muted relative overflow-hidden">
                    {e.cover_image_url ? (
                      <img src={e.cover_image_url} alt={e.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    ) : (
                      <div className="w-full h-full gradient-accent flex items-center justify-center"><Calendar className="h-12 w-12 text-white/60" /></div>
                    )}
                  </div>
                  <div className="p-5">
                    <div className="text-xs text-primary font-medium mb-2">{formatDateTime(e.starts_at)}</div>
                    <h3 className="font-semibold text-lg mb-2 line-clamp-2">{e.title}</h3>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{e.venue || e.city || "TBA"}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Features */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-4xl font-bold mb-4">Everything organizers need</h2>
            <p className="text-muted-foreground text-lg">From the first ticket to the final analytics report.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: <Calendar className="h-5 w-5" />, title: "Create & publish", desc: "Draft events, set capacity, schedule, publish with one click." },
              { icon: <Ticket className="h-5 w-5" />, title: "Flexible tickets", desc: "Free and paid tiers with quantity limits and sale windows." },
              { icon: <QrCode className="h-5 w-5" />, title: "QR check‑in", desc: "Scan tickets at the door — fast, offline‑friendly validation." },
              { icon: <BarChart3 className="h-5 w-5" />, title: "Live analytics", desc: "Track sales, revenue and attendance in real time." },
            ].map((f) => (
              <div key={f.title} className="p-6 rounded-xl bg-card border border-border shadow-card hover:shadow-elevated transition-shadow">
                <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">{f.icon}</div>
                <h3 className="font-semibold mb-2">{f.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-secondary">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold mb-4">Ready to host your first event?</h2>
          <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">Free to start. Pay only when you sell tickets.</p>
          <Link to="/auth"><Button size="lg" className="gap-2 h-12 px-8">Create free account <ArrowRight className="h-4 w-4" /></Button></Link>
        </div>
      </section>

      <footer className="bg-background border-t border-border py-10">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <BrandLogo className="h-6 w-6" />
            <span>© {new Date().getFullYear()} EventSuite — a product of <span className="font-semibold text-foreground">Vermaak</span></span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link to="/legal/terms" className="hover:text-foreground">Terms</Link>
            <Link to="/legal/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/events" className="hover:text-foreground">Events</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
