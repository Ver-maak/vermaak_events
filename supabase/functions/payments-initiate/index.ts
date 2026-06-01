// Authenticated buyer initiates payment for an order.
// Flow:
//   1. Verify caller owns the pending order.
//   2. Create a pending payment_intent row up front; its id is used as the
//      Swarmbyte X-Idempotency-Key, so safe retries (network errors, retries
//      from the client) never create a duplicate Swarmbyte collection.
//   3. Call provider.initiate(); persist the providerRef + raw response.
//   4. Return { intent_id, provider_ref, redirect_url?, await_confirmation? }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { adminClient, corsHeaders, getProvider, loadProviderConfig, logCall } from "../_shared/payments.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userSb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: ce } = await userSb.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (ce || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub;

    const body = await req.json().catch(() => ({}));
    const { order_id, provider_code, phone } = body as { order_id?: string; provider_code?: string; phone?: string };
    if (!order_id || !provider_code) return json({ error: "order_id and provider_code required" }, 400);

    const sb = adminClient();
    const { data: order, error: oe } = await sb.from("orders").select("*").eq("id", order_id).single();
    if (oe || !order) return json({ error: "Order not found" }, 404);
    if (order.buyer_id !== userId) return json({ error: "Forbidden" }, 403);
    if (order.status !== "pending") return json({ error: `Order is ${order.status}` }, 400);

    // Load provider config; fall back to stub mode if not configured or disabled
    // so checkout still works in dev/preview environments.
    let cfg: Awaited<ReturnType<typeof loadProviderConfig>> | null = null;
    try {
      cfg = await loadProviderConfig(provider_code);
    } catch (_e) {
      cfg = null;
    }
    if (!cfg || !cfg.enabled || !cfg.credentials?.api_key) {
      return json({
        ok: true,
        stub: true,
        await_confirmation: false,
        message: "Payments are not configured yet. Using stub confirmation.",
      });
    }

    const provider = getProvider(provider_code);
    const projectUrl = Deno.env.get("SUPABASE_URL")!;
    const callbackUrl = cfg.callback_url ||
      `${projectUrl}/functions/v1/payments-webhook?provider=${provider_code}`;

    const buyerPhone = phone || order.buyer_phone || "";

    // Create the intent first so we have a stable idempotency key.
    const intentId = crypto.randomUUID();
    const { error: insertErr } = await sb.from("payment_intents").insert({
      id: intentId,
      order_id: order.id,
      provider: provider_code,
      provider_ref: `pending:${intentId}`, // placeholder; replaced after initiate
      amount: order.total_amount,
      currency: order.currency,
      phone: buyerPhone,
      status: "pending",
      raw: {},
    });
    if (insertErr) return json({ error: insertErr.message }, 500);

    let result;
    try {
      result = await provider.initiate(cfg, {
        orderId: order.id,
        intentId,
        amount: Number(order.total_amount),
        currency: order.currency,
        buyer: { name: order.buyer_name, email: order.buyer_email, phone: buyerPhone || undefined },
        callbackUrl,
        redirectSuccessUrl: cfg.redirect_success_url || undefined,
        redirectCancelUrl: cfg.redirect_cancel_url || undefined,
        idempotencyKey: intentId,
      });
    } catch (e) {
      await sb.from("payment_intents").update({
        status: "failed",
        raw: { error: (e as Error).message },
      }).eq("id", intentId);
      await logCall({
        provider_code, direction: "outbound", endpoint: "initiate",
        request: { order_id }, response: { error: (e as Error).message },
        order_id, intent_id: intentId,
      });
      return json({ error: (e as Error).message }, 502);
    }

    await sb.from("payment_intents").update({
      provider_ref: result.providerRef,
      raw: (result.raw as any) || {},
    }).eq("id", intentId);

    await logCall({
      provider_code, direction: "outbound", endpoint: "initiate",
      request: { order_id, amount: order.total_amount },
      response: result.raw, order_id, intent_id: intentId,
    });

    return json({
      ok: true,
      intent_id: intentId,
      provider_ref: result.providerRef,
      redirect_url: result.redirectUrl,
      await_confirmation: result.awaitConfirmation || false,
      message: result.message,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
