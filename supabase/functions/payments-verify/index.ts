// Manual verify — used to reconcile when webhook is delayed or missing.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { adminClient, corsHeaders, getProvider, loadProviderConfig, logCall } from "../_shared/payments.ts";
import { finalizePayment } from "../_shared/finalize.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userSb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await userSb.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);

    const { intent_id } = await req.json();
    if (!intent_id) return json({ error: "intent_id required" }, 400);

    const sb = adminClient();
    const { data: intent, error: ie } = await sb.from("payment_intents").select("*").eq("id", intent_id).single();
    if (ie || !intent) return json({ error: "intent not found" }, 404);

    const cfg = await loadProviderConfig(intent.provider);
    const provider = getProvider(intent.provider);
    const v = await provider.verify(cfg, intent.provider_ref);
    await logCall({ provider_code: intent.provider, direction: "outbound", endpoint: "verify",
      request: { intent_id }, response: v.raw, intent_id });

    if (v.status === "success" || v.status === "failed" || v.status === "cancelled") {
      const result = await finalizePayment(intent.provider_ref, v.status, v.raw || {});
      return json({ ok: true, status: v.status, result });
    }
    return json({ ok: true, status: v.status });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
