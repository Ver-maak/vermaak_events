// Super-admin only: create an organization (optional) and provision an organizer
// user with a generated temporary password. Returns the credentials once.
import { adminClient, corsHeaders } from "../_shared/finalize.ts";

function genPassword(len = 14) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => chars[b % chars.length]).join("");
}
function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || ("org-" + crypto.randomUUID().slice(0, 6));
}
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return j({ error: "method not allowed" }, 405);

  try {
    const sb = adminClient();

    // Authn: require super_admin
    const auth = req.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return j({ error: "unauthorized" }, 401);
    const { data: userData, error: uErr } = await sb.auth.getUser(token);
    if (uErr || !userData?.user) return j({ error: "unauthorized" }, 401);
    const callerId = userData.user.id;
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: callerId, _role: "super_admin" });
    if (!isAdmin) return j({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const email = (body.email || "").toString().trim().toLowerCase();
    const fullName = (body.full_name || "").toString().trim();
    const orgName = (body.organization_name || "").toString().trim();
    let organizationId: string | null = body.organization_id || null;

    if (!email || !/.+@.+\..+/.test(email)) return j({ error: "valid email required" }, 400);
    if (!organizationId && !orgName) return j({ error: "organization_name or organization_id required" }, 400);

    // Create org if needed
    let organization: any = null;
    if (!organizationId) {
      const slug = (body.slug ? slugify(body.slug) : slugify(orgName));
      const { data: org, error: oErr } = await sb.from("organizations")
        .insert({ name: orgName, slug }).select().single();
      if (oErr) return j({ error: "could not create organization: " + oErr.message }, 400);
      organization = org;
      organizationId = org.id;
    } else {
      const { data: org } = await sb.from("organizations").select("*").eq("id", organizationId).maybeSingle();
      organization = org;
    }

    // Check if a user with this email already exists
    let userId: string | null = null;
    let generatedPassword: string | null = null;
    let alreadyExisted = false;

    const { data: existingProfile } = await sb.from("profiles").select("id, email").ilike("email", email).maybeSingle();
    if (existingProfile) {
      userId = existingProfile.id;
      alreadyExisted = true;
    } else {
      generatedPassword = genPassword(14);
      const { data: created, error: cErr } = await sb.auth.admin.createUser({
        email,
        password: generatedPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName || email.split("@")[0] },
      });
      if (cErr || !created?.user) return j({ error: "could not create user: " + (cErr?.message || "unknown") }, 400);
      userId = created.user.id;
    }

    // Update profile: link organization + name + force-change flag for new users
    await sb.from("profiles").update({
      organization_id: organizationId,
      full_name: fullName || undefined,
      must_change_password: !alreadyExisted,
    }).eq("id", userId!);

    // Grant organizer role (idempotent)
    const { error: rErr } = await sb.from("user_roles").insert({
      user_id: userId!, role: "organizer", organization_id: organizationId,
    });
    if (rErr && !rErr.message.toLowerCase().includes("duplicate")) {
      return j({ error: "could not assign role: " + rErr.message }, 400);
    }

    // Audit log (best effort)
    await sb.from("audit_logs").insert({
      user_id: callerId,
      organization_id: organizationId,
      action: "organizer.provisioned",
      resource_type: "user",
      resource_id: userId,
      details: { email, already_existed: alreadyExisted },
    }).select();

    return j({
      ok: true,
      organization,
      user: { id: userId, email, full_name: fullName },
      credentials: generatedPassword
        ? { email, password: generatedPassword, login_url: `${new URL(req.url).origin.replace(/\/+$/, "")}` }
        : null,
      already_existed: alreadyExisted,
    });
  } catch (e) {
    return j({ error: (e as Error).message }, 500);
  }
});
