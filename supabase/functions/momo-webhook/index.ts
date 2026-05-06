// Webhook endpoint for MTN MoMo + Airtel Money callbacks.
// URL pattern: /momo-webhook?provider=mtn_momo  (or airtel_money)
// HMAC-SHA256 signature in header `X-Signature` over raw body, using
// MTN_WEBHOOK_SECRET / AIRTEL_WEBHOOK_SECRET respectively.
import { corsHeaders, hmacSha256Hex, timingSafeEqual, finalizePayment } from "../_shared/finalize.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const provider = url.searchParams.get("provider") || "mtn_momo";
    if (!["mtn_momo", "airtel_money"].includes(provider)) {
      return json({ error: "invalid provider" }, 400);
    }

    const secretName = provider === "mtn_momo" ? "MTN_WEBHOOK_SECRET" : "AIRTEL_WEBHOOK_SECRET";
    const secret = Deno.env.get(secretName);
    const rawBody = await req.text();

    // Signature verification (skip only if no secret configured AND request comes from our own service role)
    const sigHeader = req.headers.get("x-signature") || "";
    const authHeader = req.headers.get("authorization") || "";
    const internal = authHeader === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;

    if (!internal) {
      if (!secret) return json({ error: `${secretName} not configured` }, 500);
      const expected = await hmacSha256Hex(secret, rawBody);
      if (!timingSafeEqual(sigHeader.replace(/^sha256=/, ""), expected)) {
        return json({ error: "invalid signature" }, 401);
      }
    }

    const body = JSON.parse(rawBody);

    // Normalize provider payload → { providerRef, status }
    let providerRef = "";
    let status: "success" | "failed" | "cancelled" = "failed";

    if (provider === "mtn_momo") {
      // MTN Collections callback shape
      providerRef = body.externalId || body.referenceId || body.financialTransactionId || "";
      const s = (body.status || "").toUpperCase();
      status = s === "SUCCESSFUL" ? "success" : s === "FAILED" ? "failed" : s === "CANCELLED" ? "cancelled" : "failed";
    } else {
      // Airtel Money callback shape
      providerRef = body?.transaction?.id || body?.reference || body.transactionId || "";
      const code = body?.transaction?.status_code || body?.status_code;
      status = code === "TS" || body?.transaction?.status === "SUCCESS" ? "success" : "failed";
    }

    if (!providerRef) return json({ error: "missing provider reference" }, 400);

    const result = await finalizePayment(providerRef, status, body);
    return json({ ok: true, result });
  } catch (e) {
    console.error("momo-webhook error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
