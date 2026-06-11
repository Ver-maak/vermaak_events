// Manual verify — used to reconcile when webhook is delayed or missing.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { adminClient, corsHeaders, getProvider, loadProviderConfig, logCall } from "../_shared/payments.ts";
import { finalizePayment } from "../_shared/finalize.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "Please sign in again before checking payment status." });
    const userSb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: ue } = await userSb.auth.getUser(token);
    if (ue || !userData?.user?.id) return json({ ok: false, error: "Your session expired. Please sign in again." });

    const { intent_id } = await req.json().catch(() => ({}));
    if (!intent_id) return json({ ok: false, error: "Missing payment reference." });

    const sb = adminClient();
    const { data: intent, error: ie } = await sb
      .from("payment_intents")
      .select("*, orders!inner(buyer_id)")
      .eq("id", intent_id)
      .single();
    if (ie || !intent) return json({ ok: false, error: "Payment attempt not found." });
    if ((intent as any).orders?.buyer_id !== userData.user.id) return json({ ok: false, error: "You can only check your own payment." });
    if (intent.status === "success") {
      return json({ ok: true, status: intent.status, raw: intent.raw || {} });
    }
    if (intent.status === "failed" || intent.status === "cancelled") {
      // Webhook payloads don't include failureReason — fetch it once from the
      // provider's status endpoint so the buyer sees WHY the payment failed.
      let raw = (intent.raw || {}) as Record<string, unknown>;
      const hasReason = !!((raw as any)?.failureReason || (raw as any)?.data?.failureReason);
      if (!hasReason && !String(intent.provider_ref).startsWith("pending:")) {
        try {
          const cfg = await loadProviderConfig(intent.provider);
          const provider = getProvider(intent.provider);
          const v = await provider.verify(cfg, intent.provider_ref);
          if (v.raw) {
            raw = v.raw as Record<string, unknown>;
            await sb.from("payment_intents").update({ raw }).eq("id", intent.id);
          }
        } catch (_) { /* best effort enrichment only */ }
      }
      return json({ ok: true, status: intent.status, raw });
    }
    if (String(intent.provider_ref).startsWith("pending:")) {
      return json({ ok: true, status: "pending", raw: intent.raw || {} });
    }

    const cfg = await loadProviderConfig(intent.provider);
    const provider = getProvider(intent.provider);
    const v = await provider.verify(cfg, intent.provider_ref);
    await logCall({ provider_code: intent.provider, direction: "outbound", endpoint: "verify",
      request: { intent_id }, response: v.raw, intent_id });

    if (v.status === "success" || v.status === "failed" || v.status === "cancelled") {
      const result = await finalizePayment(intent.provider_ref, v.status, v.raw || {});
      return json({ ok: true, status: v.status, result, raw: v.raw || {} });
    }
    return json({ ok: true, status: v.status, raw: v.raw || {} });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message || "Payment status could not be checked.", retryable: true });
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
