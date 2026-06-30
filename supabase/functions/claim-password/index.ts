import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { email, password } = await req.json();
    const clean = String(email || "").trim().toLowerCase();
    if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      return json({ ok: false, code: "invalid_email" }, 400);
    }
    if (!password || String(password).length < 6) {
      return json({ ok: false, code: "weak_password" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up the user by email via raw SQL on auth.users (admin only).
    const { data: rows, error: qErr } = await admin
      .from("_users_passwordless_check" as any)
      .select("*")
      .limit(0); // dummy to force types — we'll use rpc-style query below
    void rows; void qErr;

    // Use a direct SQL query through the service role with rest "rpc" not available; use the admin REST API instead.
    const url = Deno.env.get("SUPABASE_URL")! + "/auth/v1/admin/users?email=" + encodeURIComponent(clean);
    const resp = await fetch(url, {
      headers: {
        apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        Authorization: "Bearer " + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      },
    });
    const body = await resp.json();
    const user = body?.users?.[0] ?? body?.[0] ?? null;
    if (!user?.id) {
      return json({ ok: false, code: "not_found" });
    }

    // Detect if the user already has a password set. The admin REST endpoint does not
    // return encrypted_password, so we probe by checking app_metadata.providers — but
    // magic-link-only users still show provider 'email'. The reliable signal is a
    // direct check via SQL. We use the service-role PostgREST endpoint on auth.users.
    const sqlResp = await fetch(
      Deno.env.get("SUPABASE_URL")! + "/rest/v1/rpc/has_password_set",
      {
        method: "POST",
        headers: {
          apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          Authorization: "Bearer " + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ _user_id: user.id }),
      }
    );
    const hasPassword = await sqlResp.json();

    if (hasPassword === true) {
      return json({ ok: false, code: "password_exists" });
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
    });
    if (updErr) {
      return json({ ok: false, code: "update_failed", message: updErr.message }, 500);
    }

    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, code: "exception", message: String((e as Error).message || e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
