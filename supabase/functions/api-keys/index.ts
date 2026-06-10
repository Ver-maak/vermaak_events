// User-facing edge function (JWT-authed) to create / list / revoke API keys.
// Returns the plaintext key ONLY at creation; only the hash is stored.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, sha256Hex, adminClient } from "../_shared/finalize.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return j({ error: "unauthorized" }, 401);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: ud } = await sb.auth.getUser();
    const userId = ud?.user?.id;
    if (!userId) return j({ error: "unauthorized" }, 401);

    const admin = adminClient();
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "list";

    if (req.method === "GET" || action === "list") {
      const { data } = await admin.from("api_keys").select("id,name,prefix,created_at,last_used_at,revoked_at")
        .eq("organizer_id", userId).order("created_at", { ascending: false });
      return j({ keys: data });
    }

    if (req.method === "POST" && action === "create") {
      const { name } = await req.json();
      const random = crypto.getRandomValues(new Uint8Array(24));
      const b64 = btoa(String.fromCharCode(...random)).replace(/[+/=]/g, "").slice(0, 32);
      const key = `esk_live_${b64}`;
      const prefix = key.slice(0, 14);
      const hash = await sha256Hex(key);
      const { data, error } = await admin.from("api_keys").insert({
        organizer_id: userId, name: name || "Default key", prefix, key_hash: hash,
      }).select("id,name,prefix,created_at").single();
      if (error) return j({ error: error.message }, 400);
      return j({ key, ...data });
    }

    if (req.method === "POST" && action === "revoke") {
      const { id } = await req.json();
      const { error } = await admin.from("api_keys").update({ revoked_at: new Date().toISOString() })
        .eq("id", id).eq("organizer_id", userId);
      if (error) return j({ error: error.message }, 400);
      return j({ ok: true });
    }

    return j({ error: "bad action" }, 400);
  } catch (e) {
    return j({ error: (e as Error).message }, 500);
  }
});
function j(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
