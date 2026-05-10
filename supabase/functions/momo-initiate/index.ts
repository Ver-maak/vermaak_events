// Creates a payment_intent for an order (called by checkout flow).
// Initiation stays simulated — real provider request would be added here later.
// Returns the provider_ref the simulator (or a real callback) will use to finalize.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/finalize.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: uerr } = await sb.auth.getUser(auth.replace("Bearer ", ""));
    if (uerr || !userData?.user?.id) return json({ error: "unauthorized" }, 401);
    const userId = userData.user.id;

    const { order_id, provider, phone } = await req.json();
    if (!order_id || !["mtn_momo", "airtel_money"].includes(provider)) return json({ error: "bad input" }, 400);

    const { data: order, error: oerr } = await sb.from("orders").select("*").eq("id", order_id).single();
    if (oerr || !order) return json({ error: "order not found" }, 404);
    if (order.buyer_id !== userId) return json({ error: "forbidden" }, 403);
    if (order.status !== "pending") return json({ error: `order is ${order.status}` }, 400);

    // Compute the inclusive amount (subtotal + tenant processing fee) using fee-tier engine
    const { data: quote, error: qerr } = await sb.rpc("quote_order_fee", { _order_id: order_id });
    if (qerr) return json({ error: qerr.message }, 400);
    const chargeAmount = Number((quote as any)?.grand_total ?? order.total_amount);
    const feeAmount = Number((quote as any)?.fee ?? 0);

    const providerRef = `${provider === "mtn_momo" ? "MTN" : "AIR"}-${crypto.randomUUID()}`;

    const { error: ierr } = await sb.from("payment_intents").insert({
      order_id, provider, phone, amount: chargeAmount, currency: order.currency,
      provider_ref: providerRef, status: "pending",
      raw: { fee: feeAmount, subtotal: Number(order.total_amount), tier_label: (quote as any)?.tier_label },
    });
    if (ierr) return json({ error: ierr.message }, 400);

    return json({ provider_ref: providerRef, charge_amount: chargeAmount, fee: feeAmount });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
