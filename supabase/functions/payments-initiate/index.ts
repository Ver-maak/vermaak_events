// Authenticated buyer initiates payment for an order.
// Looks up order, loads provider config, calls provider.initiate, records payment_intent.
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

    const { order_id, provider_code } = await req.json();
    if (!order_id || !provider_code) return json({ error: "order_id and provider_code required" }, 400);

    const sb = adminClient();
    const { data: order, error: oe } = await sb.from("orders").select("*").eq("id", order_id).single();
    if (oe || !order) return json({ error: "Order not found" }, 404);
    if (order.buyer_id !== userId) return json({ error: "Forbidden" }, 403);
    if (order.status !== "pending") return json({ error: `Order is ${order.status}` }, 400);

    const cfg = await loadProviderConfig(provider_code);
    if (!cfg.enabled) return json({ error: `${provider_code} is disabled` }, 400);

    const provider = getProvider(provider_code);
    const projectUrl = Deno.env.get("SUPABASE_URL")!;
    const callbackUrl = cfg.callback_url || `${projectUrl}/functions/v1/payments-webhook?provider=${provider_code}`;

    let result;
    try {
      result = await provider.initiate(cfg, {
        orderId: order.id,
        amount: Number(order.total_amount),
        currency: order.currency,
        buyer: { name: order.buyer_name, email: order.buyer_email, phone: order.buyer_phone || undefined },
        callbackUrl,
        redirectSuccessUrl: cfg.redirect_success_url || undefined,
        redirectCancelUrl: cfg.redirect_cancel_url || undefined,
      });
    } catch (e) {
      await logCall({
        provider_code, direction: "outbound", endpoint: "initiate",
        request: { order_id }, response: { error: (e as Error).message }, order_id,
      });
      return json({ error: (e as Error).message }, 502);
    }

    const { data: intent } = await sb.from("payment_intents").insert({
      order_id: order.id,
      provider: provider_code,
      provider_ref: result.providerRef,
      amount: order.total_amount,
      currency: order.currency,
      phone: order.buyer_phone,
      status: "pending",
      raw: (result.raw as any) || {},
    }).select().single();

    await logCall({
      provider_code, direction: "outbound", endpoint: "initiate",
      request: { order_id, amount: order.total_amount }, response: result.raw,
      order_id, intent_id: intent?.id,
    });

    return json({
      ok: true,
      intent_id: intent?.id,
      provider_ref: result.providerRef,
      redirect_url: result.redirectUrl,
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
