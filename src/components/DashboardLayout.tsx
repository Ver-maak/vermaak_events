import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Wallet, LayoutDashboard, Users, Building2, ArrowLeftRight,
  Settings, LogOut, Menu, X, Shield, ChevronDown, Bell, Percent
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

const DashboardLayout = ({ children }: { children: ReactNode }) => {
  const { profile, roles, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isSuperAdmin = roles.includes("super_admin");
  const isTenantAdmin = roles.includes("tenant_admin");

  const navItems: NavItem[] = [
    { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
    ...(isSuperAdmin ? [
      { label: "Organizations", href: "/dashboard/organizations", icon: <Building2 className="h-4 w-4" /> },
      { label: "All Users", href: "/dashboard/users", icon: <Users className="h-4 w-4" /> },
    ] : []),
    ...(isTenantAdmin ? [
      { label: "Team", href: "/dashboard/team", icon: <Users className="h-4 w-4" /> },
    ] : []),
    { label: "Wallets", href: "/dashboard/wallets", icon: <Wallet className="h-4 w-4" /> },
    { label: "Transactions", href: "/dashboard/transactions", icon: <ArrowLeftRight className="h-4 w-4" /> },
    ...(isSuperAdmin ? [
      { label: "Fee Management", href: "/dashboard/fees", icon: <Percent className="h-4 w-4" /> },
    ] : []),
    ...(isSuperAdmin || isTenantAdmin ? [
      { label: "Settings", href: "/dashboard/settings", icon: <Settings className="h-4 w-4" /> },
    ] : []),
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const roleLabel = isSuperAdmin ? "Super Admin" : isTenantAdmin ? "Tenant Admin" : "User";

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-foreground/20 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border transform transition-transform lg:translate-x-0 lg:static ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-sidebar-border">
            <div className="flex items-center justify-between">
              <Link to="/dashboard" className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
                  <Wallet className="h-4 w-4 text-primary-foreground" />
                </div>
                <span className="font-bold text-sidebar-foreground">PayFlow</span>
              </Link>
              <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-sidebar-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-primary font-medium"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="p-3 border-t border-sidebar-border">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-medium text-sidebar-accent-foreground">
                {profile?.full_name?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">
                  {profile?.full_name || "User"}
                </p>
                <p className="text-xs text-sidebar-foreground/60 flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  {roleLabel}
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-foreground">
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon">
              <Bell className="h-4 w-4" />
            </Button>
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
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
