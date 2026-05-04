import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Calendar, MapPin, CheckCircle2 } from "lucide-react";
import { formatDateTime, formatMoney } from "@/lib/format";

const OrderDetail = () => {
  const { id } = useParams();
  const { data: order, isLoading } = useQuery({
    queryKey: ["order-detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("*,events(title,starts_at,venue,city,cover_image_url),tickets(*,ticket_tiers(name))").eq("id", id!).maybeSingle();
      return data;
    },
  });

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
              <Card key={t.id} className="overflow-hidden">
                <div className="p-5 flex flex-col items-center text-center">
                  <p className="text-xs uppercase tracking-wide text-primary font-semibold mb-1">{t.ticket_tiers?.name || "Ticket"}</p>
                  <p className="font-medium mb-3">{t.holder_name}</p>
                  <div className="bg-white p-3 rounded-lg border">
                    <QRCodeSVG value={t.code} size={160} />
                  </div>
                  <p className="font-mono text-xs mt-3 text-muted-foreground">{t.code}</p>
                  {t.checked_in_at && <p className="mt-2 text-xs text-success flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Checked in</p>}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default OrderDetail;
