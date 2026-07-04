import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, formatDateTime } from "@/lib/format";
import vermaakLogoUrl from "@/assets/vermaak-logo.png";

async function loadImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

type EventRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at?: string | null;
  venue?: string | null;
  city?: string | null;
  currency: string;
  cover_image_url?: string | null;
  description?: string | null;
  organizer_id?: string | null;
};

function groupByDate(dates: (string | null | undefined)[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const d of dates) {
    if (!d) continue;
    const key = new Date(d).toLocaleDateString("en-UG", { day: "2-digit", month: "short", year: "numeric" });
    map[key] = (map[key] || 0) + 1;
  }
  return map;
}

const PALETTE: [number, number, number][] = [
  [20, 30, 55],
  [45, 212, 191],
  [139, 92, 246],
  [244, 114, 182],
  [251, 191, 36],
  [96, 165, 250],
  [248, 113, 113],
  [52, 211, 153],
];

function ensureSpace(doc: jsPDF, y: number, needed: number, margin: number): number {
  const ph = doc.internal.pageSize.getHeight();
  if (y + needed > ph - 40) {
    doc.addPage();
    return margin + 20;
  }
  return y;
}

function drawBarChart(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  data: { label: string; value: number }[],
  title: string,
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text(title, x, y);
  const top = y + 10;
  const chartH = h - 40;
  const chartW = w;
  const max = Math.max(1, ...data.map((d) => d.value));
  const barGap = 6;
  const barW = Math.max(4, (chartW - barGap * (data.length - 1)) / Math.max(1, data.length));
  doc.setDrawColor(200, 200, 200);
  doc.line(x, top + chartH, x + chartW, top + chartH);
  data.forEach((d, i) => {
    const barH = (d.value / max) * (chartH - 10);
    const bx = x + i * (barW + barGap);
    const by = top + chartH - barH;
    const c = PALETTE[i % PALETTE.length];
    doc.setFillColor(c[0], c[1], c[2]);
    doc.rect(bx, by, barW, barH, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(60, 60, 60);
    doc.text(String(d.value), bx + barW / 2, by - 2, { align: "center" });
    doc.setTextColor(90, 90, 90);
    const label = d.label.length > 12 ? d.label.slice(0, 11) + "…" : d.label;
    doc.text(label, bx + barW / 2, top + chartH + 10, { align: "center" });
  });
}

function drawPieChart(
  doc: jsPDF,
  cx: number,
  cy: number,
  r: number,
  data: { label: string; value: number }[],
  title: string,
  formatVal: (n: number) => string,
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text(title, cx - r, cy - r - 10);
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let start = -Math.PI / 2;
  const steps = 48;
  data.forEach((d, i) => {
    const angle = (d.value / total) * Math.PI * 2;
    const c = PALETTE[i % PALETTE.length];
    doc.setFillColor(c[0], c[1], c[2]);
    const pts: [number, number][] = [[cx, cy]];
    for (let s = 0; s <= steps; s++) {
      const t = start + (angle * s) / steps;
      pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
    }
    const deltas = pts.slice(1).map((p, idx) => [p[0] - pts[idx][0], p[1] - pts[idx][1]] as [number, number]);
    (doc as any).lines(deltas, pts[0][0], pts[0][1], [1, 1], "F", true);
    start += angle;
  });
  let ly = cy - r;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  data.forEach((d, i) => {
    const c = PALETTE[i % PALETTE.length];
    doc.setFillColor(c[0], c[1], c[2]);
    doc.rect(cx + r + 14, ly - 8, 10, 10, "F");
    doc.setTextColor(40, 40, 40);
    const pct = Math.round((d.value / total) * 100);
    doc.text(`${d.label} — ${pct}% (${formatVal(d.value)})`, cx + r + 30, ly);
    ly += 14;
  });
}

function drawHBarChart(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  data: { label: string; value: number }[],
  title: string,
  formatVal: (n: number) => string,
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text(title, x, y);
  const rowH = 18;
  const labelW = 110;
  const barMaxW = w - labelW - 90;
  const max = Math.max(1, ...data.map((d) => d.value));
  data.forEach((d, i) => {
    const ry = y + 14 + i * rowH;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const label = d.label.length > 18 ? d.label.slice(0, 17) + "…" : d.label;
    doc.text(label, x, ry + 8);
    const bw = (d.value / max) * barMaxW;
    const c = PALETTE[i % PALETTE.length];
    doc.setFillColor(c[0], c[1], c[2]);
    doc.rect(x + labelW, ry, bw, 10, "F");
    doc.setTextColor(40, 40, 40);
    doc.text(formatVal(d.value), x + labelW + bw + 4, ry + 8);
  });
}

export async function generateEventReport(event: EventRow): Promise<void> {
  // Fetch data in parallel
  const [{ data: tiers }, { data: orders }, { data: tickets }] = await Promise.all([
    supabase.from("ticket_tiers").select("*").eq("event_id", event.id).order("sort_order"),
    supabase.from("orders").select("id,buyer_name,buyer_email,total_amount,currency,status,payment_method,paid_at,created_at").eq("event_id", event.id),
    supabase.from("tickets").select("id,tier_id,holder_name,holder_email,checked_in_at,created_at,orders!inner(status)").eq("event_id", event.id),
  ]);

  const allOrders = orders || [];
  const paidOrders = allOrders.filter((o) => o.status === "paid");
  const pendingOrders = allOrders.filter((o) => o.status === "pending");
  const cancelledOrders = allOrders.filter((o) => o.status === "cancelled" || o.status === "refunded");
  const paidTickets = (tickets || []).filter((t: any) => t.orders?.status === "paid");
  const checkedIn = paidTickets.filter((t: any) => t.checked_in_at);
  const revenue = paidOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const currency = event.currency || "UGX";
  const avgOrderValue = paidOrders.length ? revenue / paidOrders.length : 0;

  // Payment method breakdown
  const methods: Record<string, number> = {};
  for (const o of paidOrders) {
    const m = o.payment_method || "Other";
    methods[m] = (methods[m] || 0) + Number(o.total_amount || 0);
  }

  // Sales trend over time (paid_at preferred, fallback created_at)
  const salesTrend = groupByDate(paidOrders.map((o) => o.paid_at || o.created_at));
  const sortedTrend = Object.entries(salesTrend).sort((a, b) => a[0].localeCompare(b[0]));

  // Fee estimate via existing edge function (best-effort)
  let feeTotal = 0;
  try {
    const { data } = await supabase.functions.invoke("estimate-fee", {
      body: { amount: revenue, currency },
    });
    feeTotal = Number((data as any)?.fee || 0);
  } catch { /* ignore */ }

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  // Load Vermaak logo (best-effort)
  const logoDataUrl = await loadImageDataUrl(vermaakLogoUrl);

  // Header
  doc.setFillColor(20, 30, 55);
  doc.rect(0, 0, pageWidth, 90, "F");
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", pageWidth - margin - 60, 15, 60, 60);
    } catch { /* ignore */ }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("Event Report", margin, 40);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated ${new Date().toLocaleString("en-UG")}`, margin, 60);
  doc.text("Powered by Vermaak Events", margin, 76);

  // Event details
  doc.setTextColor(20, 20, 20);
  let y = 120;
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(event.title, margin, y);
  y += 20;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90, 90, 90);
  doc.text(`When: ${formatDateTime(event.starts_at)}${event.ends_at ? ` — ${formatDateTime(event.ends_at)}` : ""}`, margin, y);
  y += 14;
  doc.text(`Where: ${event.venue || event.city || "TBA"}`, margin, y);
  y += 20;

  // Summary metrics
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Summary", margin, y);
  y += 6;

  autoTable(doc, {
    startY: y + 4,
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [20, 30, 55], textColor: 255 },
    head: [["Metric", "Value"]],
    body: [
      ["Tickets sold (paid)", String(paidTickets.length)],
      ["Attendees checked in", `${checkedIn.length} (${paidTickets.length ? Math.round((checkedIn.length / paidTickets.length) * 100) : 0}%)`],
      ["Paid orders", String(paidOrders.length)],
      ["Pending orders", String(pendingOrders.length)],
      ["Cancelled / refunded orders", String(cancelledOrders.length)],
      ["Gross revenue", formatMoney(revenue, currency)],
      ["Average order value", formatMoney(avgOrderValue, currency)],
      ["Platform fees (est.)", formatMoney(feeTotal, currency)],
      ["Net to organizer", formatMoney(revenue - feeTotal, currency)],
    ],
    margin: { left: margin, right: margin },
  });

  y = (doc as any).lastAutoTable.finalY + 20;

  // Tier breakdown
  if (tiers && tiers.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Tickets by tier", margin, y);
    y += 4;
    autoTable(doc, {
      startY: y + 4,
      theme: "striped",
      styles: { fontSize: 10, cellPadding: 6 },
      headStyles: { fillColor: [20, 30, 55], textColor: 255 },
      head: [["Tier", "Price", "Sold", "Checked in", "Revenue"]],
      body: tiers.map((t: any) => {
        const tierTickets = paidTickets.filter((tk: any) => tk.tier_id === t.id);
        const tierCheckIn = tierTickets.filter((tk: any) => tk.checked_in_at).length;
        const tierRev = Number(t.price || 0) * tierTickets.length;
        return [
          t.name + (t.is_active === false ? " (disabled)" : ""),
          Number(t.price) === 0 ? "Free" : formatMoney(Number(t.price), t.currency || currency),
          String(tierTickets.length),
          String(tierCheckIn),
          formatMoney(tierRev, t.currency || currency),
        ];
      }),
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 20;

    // Revenue by tier chart
    const tierChartData = tiers
      .map((t: any) => {
        const tierTickets = paidTickets.filter((tk: any) => tk.tier_id === t.id);
        return { label: t.name, value: Number(t.price || 0) * tierTickets.length };
      })
      .filter((d) => d.value > 0);
    if (tierChartData.length > 0) {
      const needed = 30 + tierChartData.length * 18;
      y = ensureSpace(doc, y, needed, margin);
      drawHBarChart(doc, margin, y, pageWidth - margin * 2, tierChartData, "Revenue by tier", (n) => formatMoney(n, currency));
      y += needed + 10;
    }
  }

  // Payment method breakdown
  if (paidOrders.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Payment methods", margin, y);
    y += 4;
    autoTable(doc, {
      startY: y + 4,
      theme: "grid",
      styles: { fontSize: 10, cellPadding: 6 },
      headStyles: { fillColor: [20, 30, 55], textColor: 255 },
      head: [["Method", "Total collected", "% of revenue"]],
      body: Object.entries(methods).map(([method, total]) => [
        method,
        formatMoney(total, currency),
        `${revenue ? Math.round((total / revenue) * 100) : 0}%`,
      ]),
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 20;

    // Pie chart of payment methods
    const pieData = Object.entries(methods).map(([label, value]) => ({ label, value }));
    if (pieData.length > 0) {
      const r = 60;
      const needed = r * 2 + 40;
      y = ensureSpace(doc, y, needed, margin);
      drawPieChart(doc, margin + r + 10, y + r + 10, r, pieData, "Revenue share by payment method", (n) => formatMoney(n, currency));
      y += needed + 10;
    }
  }

  // Sales trend over time
  if (sortedTrend.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Sales trend (paid orders by date)", margin, y);
    y += 4;
    autoTable(doc, {
      startY: y + 4,
      theme: "striped",
      styles: { fontSize: 10, cellPadding: 6 },
      headStyles: { fillColor: [20, 30, 55], textColor: 255 },
      head: [["Date", "Paid orders"]],
      body: sortedTrend.map(([date, count]) => [date, String(count)]),
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 20;

    // Bar chart of sales trend
    const trendData = sortedTrend.map(([date, count]) => ({ label: date, value: count }));
    const chartH = 140;
    y = ensureSpace(doc, y, chartH + 20, margin);
    drawBarChart(doc, margin, y, pageWidth - margin * 2, chartH, trendData, "Paid orders over time");
    y += chartH + 10;
  }

  // Check-in vs no-show chart
  if (paidTickets.length > 0) {
    const noShow = paidTickets.length - checkedIn.length;
    const attendanceData = [
      { label: "Checked in", value: checkedIn.length },
      { label: "No-show", value: noShow },
    ].filter((d) => d.value > 0);
    if (attendanceData.length > 0) {
      const r = 55;
      const needed = r * 2 + 40;
      y = ensureSpace(doc, y, needed, margin);
      drawPieChart(doc, margin + r + 10, y + r + 10, r, attendanceData, "Attendance", (n) => String(n));
      y += needed + 10;
    }
  }

  // Notes / disclaimer
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  const notes = [
    "Figures are based on orders and tickets recorded in EnventSuite at the time this report was generated.",
    "Platform fees are estimated and may differ from final settlement invoices.",
    "For questions, contact the EnventSuite support team.",
  ];
  y = ensureSpace(doc, y, 60, margin);
  for (const line of notes) {
    const wrapped = doc.splitTextToSize(line, pageWidth - margin * 2);
    doc.text(wrapped, margin, y);
    y += (wrapped.length * 11) + 6;
  }

  // Footer on every page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 20, { align: "right" });
    doc.text(event.title, margin, doc.internal.pageSize.getHeight() - 20);
  }

  const safeName = event.title.replace(/[^a-z0-9]+/gi, "_").slice(0, 60);
  doc.save(`${safeName}_report.pdf`);
}

