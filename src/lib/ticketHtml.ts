import QRCode from "qrcode";
import { formatDateTime, formatMoney } from "@/lib/format";

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const cleanFilePart = (value: string) =>
  value.replace(/[^a-z0-9-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

export interface TicketHtmlInput {
  ticket: any;
  event: any;
  order?: any;
}

export const renderTicketHtml = async ({ ticket, event, order }: TicketHtmlInput) => {
  const qrSvg = await QRCode.toString(ticket.code, {
    type: "svg",
    margin: 1,
    width: 180,
    color: { dark: "#0f172a", light: "#ffffff" },
  });
  const tierName = ticket.ticket_tiers?.name || ticket.tier_name || "Event Ticket";
  const venue = event?.venue || event?.city || "TBA";
  const holderEmail = ticket.holder_email || order?.buyer_email;
  const totalLine =
    order?.total_amount !== undefined
      ? `<div class="row"><span>Order total</span><strong>${esc(formatMoney(Number(order.total_amount), order.currency || "UGX"))}</strong></div>`
      : "";

  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(ticket.code)} — ${esc(event?.title || "EventSuite ticket")}</title>
<style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f1f5f9;color:#0f172a;font-family:Inter,Arial,sans-serif;padding:24px}
  .ticket{width:min(560px,100%);background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 20px 50px -20px rgba(15,23,42,.25);border:1px solid #e2e8f0}
  .head{background:linear-gradient(135deg,#1e40af,#7c3aed);color:#fff;padding:20px 22px;display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
  .head h1{font-size:20px;margin:4px 0 2px;line-height:1.2}
  .badge{background:rgba(255,255,255,.18);border-radius:8px;padding:8px 10px;text-align:right;font-family:ui-monospace,Menlo,monospace}
  .body{padding:22px;display:grid;grid-template-columns:1fr auto;gap:24px;align-items:center}
  .meta p{margin:0;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
  .meta strong{display:block;font-size:14px;color:#0f172a;margin-top:2px}
  .meta>div{margin-bottom:14px}
  .qr{padding:10px;border:1px solid #e2e8f0;border-radius:12px;background:#fff}
  .qr p{margin:6px 0 0;font-size:11px;text-align:center;color:#64748b;font-family:ui-monospace,Menlo,monospace}
  .foot{margin:0 22px 22px;padding:12px 14px;background:#f8fafc;border-radius:10px;font-size:13px}
  .row{display:flex;justify-content:space-between;align-items:center;gap:8px}
  .row+.row{margin-top:6px;border-top:1px dashed #e2e8f0;padding-top:6px}
  @media print{body{background:#fff;padding:0}.ticket{box-shadow:none;border:none}}
</style></head>
<body><article class="ticket">
  <header class="head">
    <div><p style="font-size:11px;text-transform:uppercase;opacity:.8;margin:0;letter-spacing:.08em">EventSuite Ticket</p>
    <h1>${esc(event?.title || "Event")}</h1>
    <p style="margin:0;opacity:.9;font-size:13px">${esc(tierName)}</p></div>
    <div class="badge"><div style="font-size:10px;opacity:.8;text-transform:uppercase">Code</div><div style="font-size:14px;font-weight:700">${esc(ticket.code)}</div></div>
  </header>
  <section class="body">
    <div class="meta">
      <div><p>Ticket holder</p><strong>${esc(ticket.holder_name)}</strong></div>
      ${holderEmail ? `<div><p>Recipient email</p><strong>${esc(holderEmail)}</strong></div>` : ""}
      <div><p>Date &amp; time</p><strong>${esc(formatDateTime(event?.starts_at))}</strong></div>
      <div><p>Venue</p><strong>${esc(venue)}</strong></div>
    </div>
    <div class="qr">${qrSvg}<p>Scan at check-in</p></div>
  </section>
  <div class="foot">
    <div class="row"><span>Order reference</span><strong>${esc(order?.reference || "—")}</strong></div>
    ${totalLine}
  </div>
</article></body></html>`;
};

export const ticketFileName = (ticket: any, event: any) =>
  `${cleanFilePart(ticket.code)}-${cleanFilePart(event?.title || "ticket")}.html`;
