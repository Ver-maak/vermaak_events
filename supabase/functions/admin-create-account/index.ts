// One-shot helper to create an auth account for a given email with a temp password.
// Also links any pending event_admin invites.
import { adminClient, corsHeaders } from "../_shared/finalize.ts";

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = adminClient();
    const body = await req.json().catch(() => ({}));
    const email = (body.email || "").toString().trim().toLowerCase();
    const password = (body.password || "").toString();
    const fullName = (body.full_name || "").toString().trim();
    if (!email || !password) return j({ error: "email and password required" }, 400);

    const { data: created, error } = await sb.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: fullName || email.split("@")[0] },
    });
    if (error || !created?.user) return j({ error: error?.message || "create failed" }, 400);

    await sb.from("profiles").update({
      full_name: fullName || undefined,
      must_change_password: true,
    }).eq("id", created.user.id);

    // Link any pending event admin invites matching this email
    const { data: linked } = await sb
      .from("event_admins")
      .update({ user_id: created.user.id })
      .is("user_id", null)
      .ilike("invited_email", email)
      .select("event_id");

    return j({ ok: true, user_id: created.user.id, email, linked_events: linked });
  } catch (e) {
    return j({ error: (e as Error).message }, 500);
  }
});
