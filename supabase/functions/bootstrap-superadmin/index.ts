// One-shot bootstrap: ensure vermaakinc1@gmail.com exists as super_admin with given password.
import { adminClient, corsHeaders } from "../_shared/finalize.ts";

const EMAIL = "vermaakinc1@gmail.com";
const PASSWORD = "admin256";

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = adminClient();

    // Find existing user by listing (paginated search by email)
    let userId: string | null = null;
    const { data: list, error: lErr } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (lErr) return j({ error: lErr.message }, 500);
    const found = list.users.find((u) => (u.email || "").toLowerCase() === EMAIL);
    if (found) {
      userId = found.id;
      const { error: uErr } = await sb.auth.admin.updateUserById(userId, {
        password: PASSWORD,
        email_confirm: true,
      });
      if (uErr) return j({ error: "update failed: " + uErr.message }, 400);
    } else {
      const { data: created, error: cErr } = await sb.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: "Vermaak Super Admin" },
      });
      if (cErr || !created?.user) return j({ error: "create failed: " + (cErr?.message || "?") }, 400);
      userId = created.user.id;
    }

    // Ensure profile exists & active, clear must_change_password
    await sb.from("profiles").upsert({
      id: userId!,
      email: EMAIL,
      full_name: "Vermaak Super Admin",
      must_change_password: true,
      status: "active",
    } as any);

    // Ensure super_admin role
    const { data: existingRole } = await sb
      .from("user_roles")
      .select("id")
      .eq("user_id", userId!)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!existingRole) {
      const { error: rErr } = await sb.from("user_roles").insert({ user_id: userId!, role: "super_admin" });
      if (rErr && !rErr.message.toLowerCase().includes("duplicate")) {
        return j({ error: "role assign failed: " + rErr.message }, 400);
      }
    }

    return j({ ok: true, user_id: userId, email: EMAIL });
  } catch (e) {
    return j({ error: (e as Error).message }, 500);
  }
});
