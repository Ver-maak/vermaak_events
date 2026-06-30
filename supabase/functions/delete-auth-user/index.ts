import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(url, service);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", claims.claims.sub);
    if (!roles?.some((r: any) => r.role === "super_admin")) {
      return new Response(JSON.stringify({ error: "Forbidden — super admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "email required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const clean = email.trim().toLowerCase();

    // Find user via admin listUsers (paginate)
    let target: any = null;
    let page = 1;
    while (page < 50 && !target) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      target = data.users.find((u) => (u.email || "").toLowerCase() === clean);
      if (data.users.length < 1000) break;
      page++;
    }

    if (!target) {
      return new Response(JSON.stringify({ ok: true, message: "No auth user found", email: clean }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clean dependent rows first (FKs may block delete)
    await admin.from("event_admins").delete().eq("user_id", target.id);
    await admin.from("user_roles").delete().eq("user_id", target.id);
    await admin.from("profiles").delete().eq("id", target.id);

    const { error: delErr } = await admin.auth.admin.deleteUser(target.id);
    if (delErr) throw delErr;

    return new Response(JSON.stringify({ ok: true, deleted_user_id: target.id, email: clean }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
