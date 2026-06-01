// Public webhook endpoint. URL: /payments-webhook?provider=swarmbyte
// Swarmbyte webhooks are unsigned by design; we therefore:
//   * verify the provider adapter still accepts the payload
//   * deduplicate via processed_webhook_events (provider + event_key UNIQUE)
//   * finalize via the idempotent mark_order_paid_by_reference RPC
// A duplicate delivery is acknowledged with 200 so Swarmbyte does not retry forever.
import { adminClient, corsHeaders, getProvider, loadProviderConfig, logCall } from "../_shared/payments.ts";
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

    // Idempotency: insert into processed_webhook_events; UNIQUE(provider,event_key)
    // means a duplicate delivery raises a 23505 and we short-circuit.
    const sb = adminClient();
    const { error: dupErr } = await sb.from("processed_webhook_events").insert({
      provider: providerCode,
      event_key: parsed.eventKey,
      payload: body,
    });
    if (dupErr) {
      const isDup = (dupErr as { code?: string }).code === "23505";
      await logCall({ provider_code: providerCode, direction: "inbound", endpoint: "webhook",
        status_code: 200, request: body, response: { duplicate: isDup, error: dupErr.message } });
      // Acknowledge duplicates so the provider stops retrying.
      return json({ ok: true, duplicate: isDup });
    }

    // pending events (e.g. collection.initiated) — log + ack, do not mutate order.
    if (parsed.status === "pending") {
      await logCall({ provider_code: providerCode, direction: "inbound", endpoint: "webhook",
        status_code: 200, request: body, response: { ok: true, status: "pending" } });
      return json({ ok: true });
    }

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
