// Picks pending webhook_deliveries, signs them, POSTs to endpoint URL,
// and records the result. Each delivery is retried up to 5 times.
import { adminClient, corsHeaders, hmacSha256Hex } from "../_shared/finalize.ts";

const MAX_ATTEMPTS = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = adminClient();
    const { data: pending } = await sb
      .from("webhook_deliveries")
      .select("id, endpoint_id, event_type, payload, attempts, webhook_endpoints!inner(url, secret, is_active)")
      .eq("status", "pending").lt("attempts", MAX_ATTEMPTS).limit(50);

    let processed = 0;
    for (const d of pending || []) {
      const ep = (d as any).webhook_endpoints;
      if (!ep?.is_active) {
        await sb.from("webhook_deliveries").update({ status: "failed", last_error: "endpoint inactive" }).eq("id", d.id);
        continue;
      }
      const body = JSON.stringify(d.payload);
      const sig = await hmacSha256Hex(ep.secret, body);
      let response_status = 0;
      let last_error: string | null = null;
      let ok = false;
      try {
        const r = await fetch(ep.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-EnventSuite-Event": d.event_type,
            "X-EnventSuite-Signature": `sha256=${sig}`,
          },
          body,
        });
        response_status = r.status;
        ok = r.ok;
        if (!ok) last_error = (await r.text()).slice(0, 500);
      } catch (e) {
        last_error = (e as Error).message.slice(0, 500);
      }
      const attempts = (d.attempts || 0) + 1;
      await sb.from("webhook_deliveries").update({
        attempts,
        response_status,
        last_error,
        status: ok ? "delivered" : attempts >= MAX_ATTEMPTS ? "failed" : "pending",
        delivered_at: ok ? new Date().toISOString() : null,
      }).eq("id", d.id);
      processed++;
    }
    return new Response(JSON.stringify({ processed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
