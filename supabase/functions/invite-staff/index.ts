// Organizer (or super_admin) invites a staff member to their organization.
// Creates an auth user with a temporary password, links the profile to the
// organization, and grants the requested role (staff | organizer).
// Returns the generated credentials once.
import { adminClient, corsHeaders } from "../_shared/finalize.ts";

function genPassword(len = 14) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => chars[b % chars.length]).join("");
}
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ALLOWED_ROLES = new Set(["staff", "organizer"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return j({ error: "method not allowed" }, 405);

  try {
    const sb = adminClient();
    const auth = req.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return j({ error: "unauthorized" }, 401);
    const { data: userData, error: uErr } = await sb.auth.getUser(token);
    if (uErr || !userData?.user) return j({ error: "unauthorized" }, 401);
    const callerId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const email = (body.email || "").toString().trim().toLowerCase();
    const fullName = (body.full_name || "").toString().trim();
    const role = (body.role || "staff").toString();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return j({ error: "valid email required" }, 400);
    if (!ALLOWED_ROLES.has(role)) return j({ error: "invalid role" }, 400);

    // Determine target organization from caller's profile (or body, if super_admin)
    const { data: callerProfile } = await sb
      .from("profiles").select("organization_id").eq("id", callerId).maybeSingle();
    const { data: isSuper } = await sb.rpc("has_role", { _user_id: callerId, _role: "super_admin" });
    const { data: isOrganizer } = await sb.rpc("has_role", { _user_id: callerId, _role: "organizer" });

    let organizationId: string | null = body.organization_id || callerProfile?.organization_id || null;
    if (!organizationId) return j({ error: "caller is not attached to an organization" }, 400);
    if (!isSuper && !isOrganizer) return j({ error: "forbidden" }, 403);
    if (!isSuper && callerProfile?.organization_id !== organizationId)
      return j({ error: "cannot invite outside your organization" }, 403);

    // Reuse existing user if email already exists, otherwise create one
    let userId: string | null = null;
    let generatedPassword: string | null = null;
    let alreadyExisted = false;
    const { data: existing } = await sb.from("profiles").select("id").ilike("email", email).maybeSingle();
    if (existing) {
      userId = existing.id;
      alreadyExisted = true;
    } else {
      generatedPassword = genPassword(14);
      const { data: created, error: cErr } = await sb.auth.admin.createUser({
        email, password: generatedPassword, email_confirm: true,
        user_metadata: { full_name: fullName || email.split("@")[0] },
      });
      if (cErr || !created?.user) return j({ error: "could not create user: " + (cErr?.message || "unknown") }, 400);
      userId = created.user.id;
    }

    await sb.from("profiles").update({
      organization_id: organizationId,
      full_name: fullName || undefined,
      must_change_password: !alreadyExisted,
    }).eq("id", userId!);

    const { error: rErr } = await sb.from("user_roles").insert({
      user_id: userId!, role, organization_id: organizationId,
    });
    if (rErr && !rErr.message.toLowerCase().includes("duplicate")) {
      return j({ error: "could not assign role: " + rErr.message }, 400);
    }

    await sb.from("audit_logs").insert({
      user_id: callerId,
      organization_id: organizationId,
      action: "staff.invited",
      resource_type: "user",
      resource_id: userId,
      details: { email, role, already_existed: alreadyExisted },
    });

    return j({
      ok: true,
      user: { id: userId, email, full_name: fullName, role },
      credentials: generatedPassword ? { email, password: generatedPassword } : null,
      already_existed: alreadyExisted,
    });
  } catch (e) {
    return j({ error: (e as Error).message }, 500);
  }
});
