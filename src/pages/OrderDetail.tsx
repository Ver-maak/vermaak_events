import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Calendar, MapPin, CheckCircle2, Trash2 } from "lucide-react";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";
import TicketPreviewCard from "@/components/TicketPreviewCard";

const OrderDetail = () => {
  const { id } = useParams();
  const { roles } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");
  const qc = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ["order-detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("*,events(title,starts_at,venue,city,cover_image_url),tickets(*,ticket_tiers(name))").eq("id", id!).maybeSingle();
      return data;
    },
  });

  const handleDelete = async (ticketId: string) => {
    setDeletingId(ticketId);
    const { error } = await supabase.from("tickets").delete().eq("id", ticketId);
    setDeletingId(null);
    if (error) {
      toast({ title: "Failed to delete ticket", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Ticket deleted" });
    qc.invalidateQueries({ queryKey: ["order-detail", id] });
  };

  if (isLoading) return <DashboardLayout><p className="text-muted-foreground">Loading…</p></DashboardLayout>;
  if (!order) return <DashboardLayout><p>Order not found</p></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <Link to="/dashboard/my-tickets" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back</Link>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{(order as any).events?.title}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Order {order.reference}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${order.status === "paid" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>{order.status}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-4 w-4" />{formatDateTime((order as any).events?.starts_at)}</div>
            <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" />{(order as any).events?.venue || (order as any).events?.city || "TBA"}</div>
            <div className="pt-2 flex justify-between font-semibold"><span>Total</span><span>{formatMoney(Number(order.total_amount), order.currency)}</span></div>
          </CardContent>
        </Card>

        <div>
          <h2 className="text-lg font-semibold mb-3">Your tickets ({(order as any).tickets?.length || 0})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(order as any).tickets?.map((t: any) => (
              <TicketPreviewCard
                key={t.id}
                ticket={t}
                event={(order as any).events}
                order={order}
                actions={isSuperAdmin && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm" className="gap-1" disabled={deletingId === t.id}>
                          <Trash2 className="h-3.5 w-3.5" />Delete ticket
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this ticket?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently removes ticket <span className="font-mono">{t.code}</span> for {t.holder_name}. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(t.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default OrderDetail;
