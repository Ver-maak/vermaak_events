// TEMPORARY debug function: fetches a Swarmbyte transaction's raw status so we
// can read the failure reason. Returns provider status payload only (no creds).
// Delete after debugging.
import { corsHeaders, getProvider, loadProviderConfig } from "../_shared/payments.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { ref } = await req.json().catch(() => ({}));
    if (!ref || typeof ref !== "string") {
      return json({ ok: false, error: "ref required" }, 400);
    }
    const cfg = await loadProviderConfig("swarmbyte");
    const provider = getProvider("swarmbyte");
    const result = await provider.verify(cfg, ref);
    return json({ ok: true, status: result.status, raw: result.raw });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
