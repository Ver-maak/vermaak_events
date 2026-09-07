// Public status check for a payment-link payment (no login required).
// The payment id is an unguessable UUID returned only to the payer.
import { adminClient, corsHeaders, getProvider, loadProviderConfig } from "../_shared/payments.ts";
import { finalizePayment } from "../_shared/finalize.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { payment_id } = await req.json().catch(() => ({}));
    if (!payment_id) return json({ ok: false, error: "Missing payment reference." });

    const sb = adminClient();
    const { data: p } = await sb
      .from("payment_link_payments")
      .select("*, payment_links(title,slug)")
      .eq("id", payment_id)
      .maybeSingle();
    if (!p) return json({ ok: false, error: "Payment not found." });

    const receipt = {
      reference: p.reference,
      amount: Number(p.amount),
      currency: p.currency,
      payer_name: p.payer_name,
      payer_email: p.payer_email,
      payer_phone: p.payer_phone,
      note: p.note,
      quantity: p.quantity,
      paid_at: p.paid_at,
      title: (p as any).payment_links?.title || "Payment",
    };

    if (p.status !== "pending" || String(p.provider_ref || "").startsWith("pending:")) {
      return json({ ok: true, status: p.status === "paid" ? "success" : p.status, receipt, raw: p.raw || {} });
    }

    const cfg = await loadProviderConfig(p.provider!);
    const provider = getProvider(p.provider!);
    const v = await provider.verify(cfg, p.provider_ref!);
    if (v.status === "success" || v.status === "failed" || v.status === "cancelled") {
      await finalizePayment(p.provider_ref!, v.status, v.raw || {});
    }
    return json({
      ok: true,
      status: v.status,
      receipt: { ...receipt, paid_at: v.status === "success" ? new Date().toISOString() : null },
      raw: v.raw || {},
    });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message || "Status could not be checked.", retryable: true });
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
