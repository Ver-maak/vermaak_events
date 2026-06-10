import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, getProvider, loadProviderConfig } from "../_shared/payments.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userSb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userSb.auth.getUser();
    if (userErr || !userData?.user?.id) return json({ error: "Unauthorized" }, 401);
    const { data: isAdmin } = await userSb.rpc("has_role", {
      _user_id: userData.user.id, _role: "super_admin",
    });
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const { code } = await req.json();
    if (!code) return json({ error: "code required" }, 400);
    const cfg = await loadProviderConfig(code);
    const provider = getProvider(code);
    const result = await provider.testConnection(cfg);
    return json(result);
  } catch (e) {
    return json({ ok: false, message: (e as Error).message });
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
