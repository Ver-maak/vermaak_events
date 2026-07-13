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

    let userId: string | null = null;

    const { data: created, error } = await sb.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: fullName || email.split("@")[0] },
    });
    if (created?.user) {
      userId = created.user.id;
    } else {
      // Look up existing user, then update password
      let page = 1;
      while (!userId) {
        const { data: list, error: lErr } = await sb.auth.admin.listUsers({ page, perPage: 200 });
        if (lErr) return j({ error: lErr.message }, 400);
        const found = list.users.find((u) => (u.email || "").toLowerCase() === email);
        if (found) userId = found.id;
        if (!list.users.length || list.users.length < 200) break;
        page++;
      }
      if (!userId) return j({ error: error?.message || "user not found" }, 400);
      const { error: upErr } = await sb.auth.admin.updateUserById(userId, {
        password, email_confirm: true, user_metadata: { full_name: fullName || email.split("@")[0] },
      });
      if (upErr) return j({ error: upErr.message }, 400);
    }

    // Ensure profile row exists
    await sb.from("profiles").upsert({
      id: userId,
      email,
      full_name: fullName || email.split("@")[0],
      must_change_password: true,
    }, { onConflict: "id" });

    const { data: linked } = await sb
      .from("event_admins")
      .update({ user_id: userId })
      .is("user_id", null)
      .ilike("invited_email", email)
      .select("event_id");

    return j({ ok: true, user_id: userId, email, linked_events: linked });
  } catch (e) {
    return j({ error: (e as Error).message }, 500);
  }
});
