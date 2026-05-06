// Simulator: posts a signed callback to the real momo-webhook.
// Lets the simulated flow exercise the same webhook code path that
// real MTN/Airtel callbacks will use in production.
import { corsHeaders, hmacSha256Hex } from "../_shared/finalize.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const { provider_ref, provider, outcome } = await req.json();
    if (!provider_ref || !provider) return json({ error: "bad input" }, 400);

    let payload: Record<string, unknown>;
    if (provider === "mtn_momo") {
      payload = { externalId: provider_ref, status: outcome === "success" ? "SUCCESSFUL" : "FAILED", reason: outcome === "success" ? "ok" : "cancelled by user" };
    } else {
      payload = { transaction: { id: provider_ref, status_code: outcome === "success" ? "TS" : "TF", status: outcome === "success" ? "SUCCESS" : "FAILED" } };
    }
    const body = JSON.stringify(payload);
    const secret = Deno.env.get(provider === "mtn_momo" ? "MTN_WEBHOOK_SECRET" : "AIRTEL_WEBHOOK_SECRET") || "dev-simulated-secret";
    const sig = await hmacSha256Hex(secret, body);

    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/momo-webhook?provider=${provider}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Signature": sig },
      body,
    });
    const data = await res.json().catch(() => ({}));
    return json({ ok: res.ok, status: res.status, data });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
