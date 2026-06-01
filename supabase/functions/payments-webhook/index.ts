// Public webhook endpoint. URL: /payments-webhook?provider=swarmbyte
// Verifies signature using the provider adapter, then finalizes the payment.
import { corsHeaders, getProvider, loadProviderConfig, logCall } from "../_shared/payments.ts";
import { finalizePayment } from "../_shared/finalize.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = new URL(req.url);
  const providerCode = url.searchParams.get("provider") || "";
  const rawBody = await req.text();

  try {
    if (!providerCode) return json({ error: "provider query param required" }, 400);
    const cfg = await loadProviderConfig(providerCode);
    const provider = getProvider(providerCode);

    const valid = await provider.verifySignature(cfg, rawBody, req.headers);
    if (!valid) {
      await logCall({ provider_code: providerCode, direction: "inbound", endpoint: "webhook",
        status_code: 401, request: safeParse(rawBody), response: { error: "invalid signature" } });
      return json({ error: "invalid signature" }, 401);
    }

    const body = safeParse(rawBody);
    const parsed = provider.parseWebhook(body);
    if (!parsed.providerRef) return json({ error: "missing provider reference" }, 400);

    const result = await finalizePayment(parsed.providerRef, parsed.status, body);
    await logCall({ provider_code: providerCode, direction: "inbound", endpoint: "webhook",
      status_code: 200, request: body, response: result });
    return json({ ok: true });
  } catch (e) {
    await logCall({ provider_code: providerCode, direction: "inbound", endpoint: "webhook",
      status_code: 500, request: safeParse(rawBody), response: { error: (e as Error).message } });
    return json({ error: (e as Error).message }, 500);
  }
});

function safeParse(s: string) { try { return JSON.parse(s); } catch { return { raw: s }; } }
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
