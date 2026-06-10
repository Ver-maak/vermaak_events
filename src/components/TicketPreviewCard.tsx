import { ReactNode, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toPng } from "html-to-image";
import { Calendar, CheckCircle2, Download, FileImage, Mail, MapPin, Printer, Ticket, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime, formatMoney } from "@/lib/format";

interface TicketPreviewCardProps {
  ticket: any;
  event: any;
  order?: any;
  actions?: ReactNode;
  showDownload?: boolean;
}

const cleanFilePart = (value: string) => value.replace(/[^a-z0-9-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

const TicketPreviewCard = ({ ticket, event, order, actions, showDownload = true }: TicketPreviewCardProps) => {
  const ticketRef = useRef<HTMLDivElement>(null);
  const tierName = ticket.ticket_tiers?.name || ticket.tier_name || "Event Ticket";
  const venue = event?.venue || event?.city || "TBA";
  const holderEmail = ticket.holder_email || order?.buyer_email;

  const standaloneHtml = () => `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${ticket.code} — ${event?.title || "EventSuite ticket"}</title>
<style>
  :root{--background:220 25% 98%;--foreground:222 47% 11%;--card:0 0% 100%;--primary:208 88% 48%;--primary-foreground:0 0% 100%;--muted:210 25% 95%;--muted-foreground:215 15% 45%;--border:210 22% 89%;--success:158 64% 42%;--ticket-qr-background:0 0% 100%;--ticket-qr-foreground:222 47% 11%;}
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:hsl(var(--background));color:hsl(var(--foreground));font-family:Inter,Arial,sans-serif;padding:24px}.ticket-wrap{width:min(560px,100%)}.no-print{display:none}@media print{body{padding:0}.ticket-wrap{width:100%}}
</style></head><body><main class="ticket-wrap">${ticketRef.current?.innerHTML || ""}</main></body></html>`;

  const downloadTicket = () => {
    const blob = new Blob([standaloneHtml()], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cleanFilePart(ticket.code)}-${cleanFilePart(event?.title || "ticket")}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const printTicket = () => {
    const win = window.open("", "_blank", "noopener,noreferrer,width=720,height=900");
    if (!win) return;
    win.document.write(standaloneHtml());
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 250);
  };

  return (
    <Card className="overflow-hidden border-primary/20 shadow-elevated">
      <div ref={ticketRef}>
        <div className="gradient-primary p-5 text-primary-foreground">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs uppercase font-semibold opacity-80">EventSuite Ticket</p>
              <h3 className="text-xl font-bold mt-1 leading-tight">{event?.title || "Event"}</h3>
              <p className="text-sm opacity-85 mt-1">{tierName}</p>
            </div>
            <div className="rounded-lg bg-primary-foreground/15 px-3 py-2 text-right shrink-0">
              <p className="text-[10px] uppercase font-semibold opacity-75">Code</p>
              <p className="font-mono text-sm font-bold">{ticket.code}</p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-5 bg-card">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-5 items-center">
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <User className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Ticket holder</p>
                  <p className="font-semibold">{ticket.holder_name}</p>
                </div>
              </div>
              {holderEmail && (
                <div className="flex items-start gap-2">
                  <Mail className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Recipient email</p>
                    <p className="font-medium truncate">{holderEmail}</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Date & time</p>
                  <p className="font-medium">{formatDateTime(event?.starts_at)}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Venue</p>
                  <p className="font-medium">{venue}</p>
                </div>
              </div>
            </div>

            <div className="mx-auto text-center">
              <div className="rounded-lg border border-border p-3" style={{ backgroundColor: "hsl(var(--ticket-qr-background))" }}>
                <QRCodeSVG value={ticket.code} size={156} bgColor="hsl(var(--ticket-qr-background))" fgColor="hsl(var(--ticket-qr-foreground))" />
              </div>
              <p className="font-mono text-xs mt-2 text-muted-foreground">Scan at check-in</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-3 text-sm">
            <div className="flex items-center gap-2">
              <Ticket className="h-4 w-4 text-primary" />
              <span className="font-medium">{order?.reference || "Confirmed ticket"}</span>
            </div>
            {order?.total_amount !== undefined && (
              <span className="font-semibold">{formatMoney(Number(order.total_amount), order.currency || "UGX")}</span>
            )}
            {ticket.checked_in_at && <span className="text-success flex items-center gap-1"><CheckCircle2 className="h-4 w-4" />Checked in</span>}
          </div>
        </div>
      </div>

      {(showDownload || actions) && (
        <div className="no-print border-t border-border bg-muted/30 p-3 flex flex-wrap gap-2 justify-end">
          {showDownload && (
            <>
              <Button variant="outline" size="sm" className="gap-2" onClick={downloadTicket}><Download className="h-4 w-4" />Download</Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={printTicket}><Printer className="h-4 w-4" />Print / PDF</Button>
            </>
          )}
          {actions}
        </div>
      )}
    </Card>
  );
};

export default TicketPreviewCard;