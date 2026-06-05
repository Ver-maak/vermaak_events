import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import JSZip from "jszip";
import { Download, MailCheck, Printer, RefreshCw, FileSpreadsheet, CheckSquare, Square } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import EmptyState from "@/components/EmptyState";
import TicketPreviewCard from "@/components/TicketPreviewCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { renderTicketHtml, ticketFileName, cleanFilePart } from "@/lib/ticketHtml";
import { formatDateTime, formatMoney } from "@/lib/format";
import { toast } from "@/hooks/use-toast";

interface Row {
  ticket: any;
  order: any;
  event: any;
}

const TicketDelivery = () => {
  const { roles, loading } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: orders, isLoading, refetch } = useQuery({
    queryKey: ["admin-ticket-delivery"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*,events(title,starts_at,venue,city),tickets(*,ticket_tiers(name))")
        .eq("status", "paid")
        .order("paid_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const rows = useMemo<Row[]>(
    () =>
      (orders || []).flatMap((order: any) =>
        (order.tickets || []).map((ticket: any) => ({ ticket, order, event: order.events })),
      ),
    [orders],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(({ ticket, order, event }) =>
      [ticket.code, ticket.holder_name, ticket.holder_email, order?.buyer_email, order?.reference, event?.title]
        .filter(Boolean).some((v: string) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, query]);

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.ticket.id));
  const someSelected = selected.size > 0 && !allSelected;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => {
      const ids = filtered.map((r) => r.ticket.id);
      const allIn = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      ids.forEach((id) => (allIn ? next.delete(id) : next.add(id)));
      return next;
    });

  const clearSelection = () => setSelected(new Set());

  const selectedRows = () => rows.filter((r) => selected.has(r.ticket.id));

  const downloadBatch = async () => {
    const list = selectedRows();
    if (!list.length) return;
    setBusy(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder("tickets")!;
      await Promise.all(
        list.map(async ({ ticket, order, event }) => {
          const html = await renderTicketHtml({ ticket, order, event });
          folder.file(ticketFileName(ticket, event), html);
        }),
      );
      const csv = buildCsv(list);
      zip.file("recipients.csv", csv);
      const blob = await zip.generateAsync({ type: "blob" });
      triggerDownload(blob, `tickets-batch-${new Date().toISOString().slice(0, 10)}.zip`);
      toast({ title: "Batch ready", description: `${list.length} ticket${list.length === 1 ? "" : "s"} packaged.` });
    } catch (e) {
      toast({ title: "Batch download failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const list = selected.size ? selectedRows() : filtered;
    if (!list.length) return;
    const blob = new Blob([buildCsv(list)], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, `ticket-recipients-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const printBatch = async () => {
    const list = selectedRows();
    if (!list.length) return;
    setBusy(true);
    try {
      const pages = await Promise.all(list.map((r) => renderTicketHtml(r)));
      const body = pages
        .map((p) => p.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || "")
        .join('<div style="page-break-after:always"></div>');
      const win = window.open("", "_blank", "noopener,noreferrer,width=820,height=1000");
      if (!win) return;
      win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Tickets batch</title>
<style>body{margin:0;font-family:Inter,Arial,sans-serif;background:#f1f5f9}@media print{body{background:#fff}}</style>
</head><body>${body}</body></html>`);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 350);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MailCheck className="h-6 w-6 text-primary" />Tickets to send
            </h1>
            <p className="text-sm text-muted-foreground">
              Select tickets to download or print in batches for faster manual delivery.
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />Refresh
          </Button>
        </div>

        <Card>
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-lg">Paid tickets ready for delivery</CardTitle>
              <div className="flex items-center gap-2">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search code, name, email…"
                  className="h-9 w-56"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              <button
                type="button"
                onClick={toggleAll}
                className="inline-flex items-center gap-2 font-medium hover:text-primary"
                disabled={filtered.length === 0}
              >
                {allSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className={`h-4 w-4 ${someSelected ? "text-primary" : ""}`} />}
                {allSelected ? "Unselect all" : "Select all"}
              </button>
              <span className="text-muted-foreground">{selected.size} selected · {filtered.length} shown</span>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="gap-2" onClick={exportCsv} disabled={!filtered.length}>
                  <FileSpreadsheet className="h-4 w-4" />Export CSV
                </Button>
                <Button size="sm" variant="outline" className="gap-2" onClick={printBatch} disabled={!selected.size || busy}>
                  <Printer className="h-4 w-4" />Print batch
                </Button>
                <Button size="sm" className="gap-2" onClick={downloadBatch} disabled={!selected.size || busy}>
                  <Download className="h-4 w-4" />Download ZIP ({selected.size})
                </Button>
                {selected.size > 0 && (
                  <Button size="sm" variant="ghost" onClick={clearSelection}>Clear</Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading tickets…</p>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<MailCheck className="h-5 w-5" />}
                title={rows.length === 0 ? "No paid tickets yet" : "No tickets match your search"}
                description={rows.length === 0 ? "Paid orders will appear here for manual delivery." : "Try a different search term."}
              />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {filtered.map(({ ticket, order, event }) => {
                  const isSel = selected.has(ticket.id);
                  return (
                    <div
                      key={ticket.id}
                      className={`relative rounded-xl transition ${isSel ? "ring-2 ring-primary" : ""}`}
                    >
                      <label className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-md bg-background/90 backdrop-blur px-2 py-1 text-xs font-medium shadow-sm cursor-pointer">
                        <Checkbox checked={isSel} onCheckedChange={() => toggle(ticket.id)} />
                        Select
                      </label>
                      <TicketPreviewCard ticket={ticket} event={event} order={order} />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

const buildCsv = (list: Row[]) => {
  const header = ["Ticket code", "Holder name", "Email", "Event", "Starts at", "Venue", "Tier", "Order reference", "Order total", "Currency"];
  const escape = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = list.map(({ ticket, order, event }) => [
    ticket.code,
    ticket.holder_name,
    ticket.holder_email || order?.buyer_email || "",
    event?.title || "",
    formatDateTime(event?.starts_at),
    event?.venue || event?.city || "",
    ticket.ticket_tiers?.name || "",
    order?.reference || "",
    order?.total_amount != null ? formatMoney(Number(order.total_amount), order.currency || "UGX") : "",
    order?.currency || "",
  ]);
  return [header, ...rows].map((r) => r.map(escape).join(",")).join("\n");
};

const triggerDownload = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export default TicketDelivery;
// Keep cleanFilePart import used (re-export to avoid tree shake warnings if needed)
export { cleanFilePart };
