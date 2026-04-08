import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Wallet, Shield, ArrowRight, Building2, Zap, Globe } from "lucide-react";

const Index = () => {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="gradient-hero min-h-screen flex items-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-primary rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary rounded-full blur-3xl" />
        </div>
        <div className="container mx-auto px-4 py-20 relative z-10">
          <nav className="flex items-center justify-between mb-20">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg gradient-primary flex items-center justify-center">
                <Wallet className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-primary-foreground">PayFlow</span>
            </div>
            <Link to="/auth">
              <Button variant="outline" className="border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10 bg-transparent">
                Sign In
              </Button>
            </Link>
          </nav>

          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-primary/20 text-primary-foreground/90 px-3 py-1 rounded-full text-sm mb-6">
              <Zap className="h-3 w-3" />
              Multi-tenant payment platform
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-primary-foreground leading-tight mb-6">
              Payment infrastructure for{" "}
              <span className="text-primary">every enterprise</span>
            </h1>
            <p className="text-lg text-primary-foreground/70 mb-8 max-w-xl">
              Create isolated payment environments for each organization. Wallets, transfers, mobile money, and card payments — all in one platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link to="/auth">
                <Button size="lg" className="gap-2 w-full sm:w-auto">
                  Get Started <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Built for scale</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: <Building2 className="h-6 w-6" />, title: "Multi-Tenant", desc: "Isolated environments for each organization with custom feature toggles." },
              { icon: <Shield className="h-6 w-6" />, title: "Enterprise Security", desc: "RBAC, KYC workflows, audit logs, and encrypted transactions." },
              { icon: <Globe className="h-6 w-6" />, title: "Multi-Currency", desc: "Support for UGX, USD, EUR, GBP, KES, TZS, and RWF wallets." },
            ].map((f) => (
              <div key={f.title} className="p-6 rounded-xl bg-card border border-border shadow-card">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">{f.icon}</div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-muted-foreground text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;
