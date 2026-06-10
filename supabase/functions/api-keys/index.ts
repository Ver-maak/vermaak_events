// User-facing edge function (JWT-authed) to create / list / revoke API keys.
// Returns the plaintext key ONLY at creation; only the hash is stored.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, sha256Hex, adminClient } from "../_shared/finalize.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return j({ error: "You must be signed in to manage API keys." }, 401);
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });

    const { data: ud, error: uerr } = await sb.auth.getUser();
    if (uerr) {
      console.error("[api-keys] getUser failed:", uerr);
      return j({ error: "Your session has expired. Please sign in again." }, 401);
    }
    const userId = ud?.user?.id;
    if (!userId) return j({ error: "Your session has expired. Please sign in again." }, 401);

    const admin = adminClient();
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || (req.method === "GET" ? "list" : "");

    // --- LIST ---
    if (action === "list" || (req.method === "GET" && !action)) {
      const { data, error } = await admin
        .from("api_keys")
        .select("id,name,prefix,created_at,last_used_at,revoked_at")
        .eq("organizer_id", userId)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("[api-keys] list failed:", error);
        return j({ error: "Could not load your API keys. Please try again." }, 500);
      }
      return j({ keys: data ?? [] });
    }

    // --- CREATE ---
    if (req.method === "POST" && action === "create") {
      let body: { name?: string } = {};
      try { body = await req.json(); } catch { body = {}; }
      const name = (body.name ?? "").toString().trim() || "Default key";
      if (name.length > 100) {
        return j({ error: "Key name must be 100 characters or fewer." }, 400);
      }

      const random = crypto.getRandomValues(new Uint8Array(24));
      const b64 = btoa(String.fromCharCode(...random)).replace(/[+/=]/g, "").slice(0, 32);
      const key = `esk_live_${b64}`;
      const prefix = key.slice(0, 14);
      const hash = await sha256Hex(key);

      const { data, error } = await admin.from("api_keys").insert({
        organizer_id: userId, name, prefix, key_hash: hash,
      }).select("id,name,prefix,created_at").single();

      if (error) {
        console.error("[api-keys] create failed:", error);
        return j({ error: "Could not create the API key. Please try again." }, 500);
      }
      return j({ key, ...data });
    }

    // --- REVOKE ---
    if (req.method === "POST" && action === "revoke") {
      let body: { id?: string } = {};
      try { body = await req.json(); } catch { body = {}; }
      if (!body.id) return j({ error: "Missing key id to revoke." }, 400);

      const { error } = await admin.from("api_keys")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", body.id).eq("organizer_id", userId);
      if (error) {
        console.error("[api-keys] revoke failed:", error);
        return j({ error: "Could not revoke the key. Please try again." }, 500);
      }
      return j({ ok: true });
    }

    return j({ error: `Unsupported action: ${action || req.method}` }, 400);
  } catch (e) {
    console.error("[api-keys] unhandled error:", e);
    return j({ error: (e as Error).message || "Unexpected server error." }, 500);
  }
});

function j(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
