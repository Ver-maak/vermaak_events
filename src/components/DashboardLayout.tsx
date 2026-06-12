import { ReactNode, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Users, Building2, Settings, LogOut, Menu, X, Shield,
  ChevronDown, Calendar, Ticket, QrCode, BarChart3, Wallet, ArrowLeftRight, Percent, Compass, Activity, Code2, CreditCard, MailCheck
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/ThemeToggle";

interface NavItem { label: string; href: string; icon: ReactNode; section?: string }

const DashboardLayout = ({ children }: { children: ReactNode }) => {
  const { profile, roles, adminEventIds, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isSuperAdmin = roles.includes("super_admin");
  const isOrganizer = roles.includes("organizer") || isSuperAdmin;
  const isEventAdmin = adminEventIds.length > 0;

  const navItems: NavItem[] = [
    { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard className="h-4 w-4" />, section: "Main" },
    { label: "Browse events", href: "/events", icon: <Compass className="h-4 w-4" />, section: "Main" },
    { label: "My tickets", href: "/dashboard/my-tickets", icon: <Ticket className="h-4 w-4" />, section: "Main" },

    ...(isOrganizer ? [
      { label: "My events", href: "/dashboard/events", icon: <Calendar className="h-4 w-4" />, section: "Organizer" },
      { label: "Check‑in", href: "/dashboard/check-in", icon: <QrCode className="h-4 w-4" />, section: "Organizer" },
      { label: "Analytics", href: "/dashboard/analytics", icon: <BarChart3 className="h-4 w-4" />, section: "Organizer" },
      { label: "Developer", href: "/dashboard/developer", icon: <Code2 className="h-4 w-4" />, section: "Organizer" },
    ] : isEventAdmin ? [
      { label: "Managed events", href: "/dashboard/events", icon: <Calendar className="h-4 w-4" />, section: "Event admin" },
      { label: "Check‑in", href: "/dashboard/check-in", icon: <QrCode className="h-4 w-4" />, section: "Event admin" },
      { label: "Analytics", href: "/dashboard/analytics", icon: <BarChart3 className="h-4 w-4" />, section: "Event admin" },
    ] : []),

    ...(isSuperAdmin ? [
      { label: "All users", href: "/dashboard/users", icon: <Users className="h-4 w-4" />, section: "Admin" },
      { label: "Wallets", href: "/dashboard/wallets", icon: <Wallet className="h-4 w-4" />, section: "Admin" },
      { label: "Transactions", href: "/dashboard/transactions", icon: <ArrowLeftRight className="h-4 w-4" />, section: "Admin" },
      { label: "Fee engine", href: "/dashboard/fees", icon: <Percent className="h-4 w-4" />, section: "Admin" },
      { label: "Payment settings", href: "/dashboard/payments", icon: <CreditCard className="h-4 w-4" />, section: "Admin" },
      { label: "Tickets to send", href: "/dashboard/ticket-delivery", icon: <MailCheck className="h-4 w-4" />, section: "Admin" },
    ] : []),

    { label: "Settings", href: "/dashboard/settings", icon: <Settings className="h-4 w-4" />, section: "Account" },
  ];

  const sections = Array.from(new Set(navItems.map((i) => i.section)));

  const handleSignOut = async () => { await signOut(); navigate("/auth"); };
  const roleLabel = isSuperAdmin ? "Super Admin" : isOrganizer ? "Organizer" : "Attendee";

  return (
    <div className="min-h-screen bg-background flex">
      {sidebarOpen && <div className="fixed inset-0 bg-foreground/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border transform transition-transform lg:translate-x-0 lg:static ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
            <Link to="/dashboard" className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <BrandLogo className="h-8 w-8" />
                <span className="font-bold text-sidebar-foreground">EventSuite</span>
              </div>
              <span className="text-[10px] text-sidebar-foreground/50 pl-10 -mt-0.5">by Vermaak</span>
            </Link>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-sidebar-foreground"><X className="h-5 w-5" /></button>
          </div>

          <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
            {sections.map((sec) => (
              <div key={sec}>
                <p className="px-3 text-[10px] uppercase tracking-wider font-semibold text-sidebar-foreground/40 mb-1">{sec}</p>
                <div className="space-y-0.5">
                  {navItems.filter((i) => i.section === sec).map((item) => {
                    const isActive = location.pathname === item.href || (item.href !== "/dashboard" && location.pathname.startsWith(item.href));
                    return (
                      <Link key={item.href} to={item.href} onClick={() => setSidebarOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                          isActive ? "bg-sidebar-accent text-sidebar-primary font-medium" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        }`}>
                        {item.icon}{item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="p-3 border-t border-sidebar-border">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-medium text-sidebar-accent-foreground">
                {profile?.full_name?.charAt(0)?.toUpperCase() || profile?.email?.[0]?.toUpperCase() || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">{profile?.full_name || profile?.email || "User"}</p>
                <p className="text-xs text-sidebar-foreground/60 flex items-center gap-1"><Shield className="h-3 w-3" />{roleLabel}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-foreground"><Menu className="h-5 w-5" /></button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                    {profile?.full_name?.charAt(0)?.toUpperCase() || "U"}
                  </div>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate("/dashboard/settings")}><Settings className="h-4 w-4 mr-2" />Settings</DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut}><LogOut className="h-4 w-4 mr-2" />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
};

export default DashboardLayout;
