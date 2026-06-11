import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import Index from "./pages/Index";
import { RouteMemory } from "@/components/RouteMemory";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Browse from "./pages/Browse";
import EventDetail from "./pages/EventDetail";
import MyTickets from "./pages/MyTickets";
import OrderDetail from "./pages/OrderDetail";
import OrganizerEvents from "./pages/organizer/Events";
import EventEditor from "./pages/organizer/EventEditor";
import CheckIn from "./pages/organizer/CheckIn";
import Analytics from "./pages/organizer/Analytics";
import Legal from "./pages/Legal";
import Wallets from "./pages/Wallets";
import Transactions from "./pages/Transactions";
import TeamUsers from "./pages/TeamUsers";
import DashboardSettings from "./pages/DashboardSettings";
import FeeManagement from "./pages/FeeManagement";
import PaymentSettings from "./pages/admin/PaymentSettings";
import TicketDelivery from "./pages/admin/TicketDelivery";
import Developer from "./pages/Developer";
import ChangePassword from "./pages/ChangePassword";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading, profile } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Loading...</div></div>;
  if (!session) return <Navigate to="/auth" replace />;
  if (profile?.must_change_password) return <Navigate to="/change-password" replace />;
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <RouteMemory />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/events" element={<Browse />} />
            <Route path="/events/:slug" element={<EventDetail />} />
            <Route path="/legal/:doc" element={<Legal />} />

            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/dashboard/my-tickets" element={<ProtectedRoute><MyTickets /></ProtectedRoute>} />
            <Route path="/dashboard/orders/:id" element={<ProtectedRoute><OrderDetail /></ProtectedRoute>} />

            <Route path="/dashboard/events" element={<ProtectedRoute><OrganizerEvents /></ProtectedRoute>} />
            <Route path="/dashboard/events/:id" element={<ProtectedRoute><EventEditor /></ProtectedRoute>} />
            <Route path="/dashboard/check-in" element={<ProtectedRoute><CheckIn /></ProtectedRoute>} />
            <Route path="/dashboard/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
            <Route path="/dashboard/developer" element={<ProtectedRoute><Developer /></ProtectedRoute>} />

            <Route path="/dashboard/wallets" element={<ProtectedRoute><Wallets /></ProtectedRoute>} />
            <Route path="/dashboard/transactions" element={<ProtectedRoute><Transactions /></ProtectedRoute>} />
            <Route path="/dashboard/users" element={<ProtectedRoute><TeamUsers /></ProtectedRoute>} />
            <Route path="/dashboard/team" element={<ProtectedRoute><TeamUsers /></ProtectedRoute>} />
            <Route path="/dashboard/fees" element={<ProtectedRoute><FeeManagement /></ProtectedRoute>} />
            <Route path="/dashboard/settings" element={<ProtectedRoute><DashboardSettings /></ProtectedRoute>} />
            <Route path="/dashboard/payments" element={<ProtectedRoute><PaymentSettings /></ProtectedRoute>} />
            <Route path="/dashboard/ticket-delivery" element={<ProtectedRoute><TicketDelivery /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
