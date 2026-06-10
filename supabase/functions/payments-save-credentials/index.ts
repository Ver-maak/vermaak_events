// Super admin saves provider credentials. Key never touches the browser.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { adminClient, corsHeaders, encKey } from "../_shared/payments.ts";

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

    const body = await req.json();
    const {
      code, name, enabled, mode,
      base_url, callback_url, redirect_success_url, redirect_cancel_url,
      credentials, preview,
    } = body || {};
    if (!code || !name) return json({ error: "code and name required" }, 400);

    const sb = adminClient();
    const { data, error } = await sb.rpc("save_payment_provider", {
      _code: code,
      _name: name,
      _enabled: !!enabled,
      _mode: mode === "live" ? "live" : "sandbox",
      _base_url: base_url || null,
      _callback_url: callback_url || null,
      _redirect_success_url: redirect_success_url || null,
      _redirect_cancel_url: redirect_cancel_url || null,
      _credentials: credentials && Object.keys(credentials).length ? credentials : {},
      _preview: preview || {},
      _enc_key: encKey(),
    });
    if (error) throw error;
    return json({ ok: true, id: data });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
