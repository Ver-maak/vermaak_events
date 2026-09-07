// Public (no login) payment-link checkout.
// Creates a payment_link_payments row and starts the provider collection.
import { adminClient, corsHeaders, getProvider, loadProviderConfig, logCall } from "../_shared/payments.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const { slug, name, email, phone, amount, quantity, note, channel, card } = body as {
      slug?: string; name?: string; email?: string; phone?: string;
      amount?: number; quantity?: number; note?: string;
      channel?: "momo" | "card"; card?: { brand?: string; last4?: string };
    };

    if (!slug) return json({ ok: false, error: "Missing payment link." });
    const payerName = String(name || "").trim();
    const payerEmail = String(email || "").trim().toLowerCase();
    if (payerName.length < 2 || payerName.length > 120) return json({ ok: false, error: "Enter your full name." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail) || payerEmail.length > 255) {
      return json({ ok: false, error: "Enter a valid email address." });
    }
    if (note && String(note).length > 500) return json({ ok: false, error: "Note is too long." });

    const sb = adminClient();
    const { data: link } = await sb.from("payment_links").select("*").eq("slug", slug).maybeSingle();
    if (!link || !link.is_active) return json({ ok: false, error: "This payment link is not available." });

    let qty = 1;
    let chargeAmount = Number(link.unit_amount);
    if (link.amount_mode === "quantity") {
      qty = Math.floor(Number(quantity || 1));
      if (!Number.isFinite(qty) || qty < 1 || qty > 1000) return json({ ok: false, error: "Enter a valid quantity." });
      chargeAmount = Number(link.unit_amount) * qty;
    } else if (link.amount_mode === "open") {
      chargeAmount = Number(amount);
      if (!Number.isFinite(chargeAmount) || chargeAmount <= 0) return json({ ok: false, error: "Enter a valid amount." });
      if (link.min_amount != null && chargeAmount < Number(link.min_amount)) {
        return json({ ok: false, error: `Minimum amount is ${link.min_amount} ${link.currency}.` });
      }
      if (link.max_amount != null && chargeAmount > Number(link.max_amount)) {
        return json({ ok: false, error: `Maximum amount is ${link.max_amount} ${link.currency}.` });
      }
    }
    chargeAmount = Math.round(chargeAmount);
    if (chargeAmount <= 0) return json({ ok: false, error: "This payment link has no amount set." });
    if (link.note_required && !String(note || "").trim()) {
      return json({ ok: false, error: `${link.note_label || "Note"} is required.` });
    }

    const isCard = channel === "card";
    if (isCard) {
      const brand = String(card?.brand || "").toLowerCase();
      if (brand !== "visa" && brand !== "mastercard") {
        return json({ ok: false, error: "Only Visa and Mastercard cards are accepted." });
      }
    }

    // Pick a provider
    const { data: providers } = await sb
      .from("payment_providers").select("code,enabled,credentials_preview").eq("enabled", true);
    const list = providers || [];
    let providerCode: string | undefined;
    if (isCard) {
      providerCode = list.find((r: any) => String(r.credentials_preview?.supports_cards) === "true")?.code;
      if (!providerCode) return json({ ok: false, error: "Card payments are not set up yet." });
    } else {
      providerCode = list.find((r: any) => r.code === "swarmbyte")?.code || list[0]?.code;
      if (!providerCode) return json({ ok: false, error: "No payment provider is enabled yet." });
    }

    let cfg;
    try {
      cfg = await loadProviderConfig(providerCode);
    } catch (_) {
      return json({ ok: false, error: `Payment provider "${providerCode}" is not configured.` });
    }

    const paymentId = crypto.randomUUID();
    const reference = "PL-" + paymentId.slice(0, 8).toUpperCase();
    const { error: insErr } = await sb.from("payment_link_payments").insert({
      id: paymentId,
      link_id: link.id,
      reference,
      payer_name: payerName,
      payer_email: payerEmail,
      payer_phone: phone || null,
      note: note || null,
      quantity: qty,
      amount: chargeAmount,
      currency: link.currency,
      status: "pending",
      provider: providerCode,
      provider_ref: `pending:${paymentId}`,
    });
    if (insErr) return json({ ok: false, error: insErr.message, retryable: true });

    const provider = getProvider(providerCode);
    const callbackUrl = cfg.callback_url ||
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/payments-webhook?provider=${providerCode}`;

    let result;
    try {
      result = await provider.initiate(cfg, {
        orderId: paymentId,
        intentId: paymentId,
        amount: chargeAmount,
        currency: link.currency,
        buyer: { name: payerName, email: payerEmail, phone: phone || undefined },
        callbackUrl,
        redirectSuccessUrl: cfg.redirect_success_url || undefined,
        redirectCancelUrl: cfg.redirect_cancel_url || undefined,
        idempotencyKey: paymentId,
        channel: isCard ? "card" : "momo",
        card: isCard ? { brand: card?.brand, last4: card?.last4 } : undefined,
      });
    } catch (e) {
      await sb.from("payment_link_payments")
        .update({ status: "failed", raw: { error: (e as Error).message } }).eq("id", paymentId);
      await logCall({ provider_code: providerCode, direction: "outbound", endpoint: "paylink-initiate",
        request: { slug, amount: chargeAmount }, response: { error: (e as Error).message } });
      return json({ ok: false, error: (e as Error).message, retryable: true });
    }

    await sb.from("payment_link_payments")
      .update({ provider_ref: result.providerRef, raw: (result.raw as any) || {} }).eq("id", paymentId);
    await logCall({ provider_code: providerCode, direction: "outbound", endpoint: "paylink-initiate",
      request: { slug, amount: chargeAmount }, response: result.raw });

    return json({
      ok: true,
      payment_id: paymentId,
      reference,
      amount: chargeAmount,
      currency: link.currency,
      redirect_url: result.redirectUrl,
      await_confirmation: result.awaitConfirmation || false,
      message: result.message,
    });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message || "Payment could not be started.", retryable: true });
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
