// Authenticated REST API for organizers using their issued API key.
// Auth: header `Authorization: Bearer <api_key>` (key starts with `esk_`).
// Routes (path is everything after /tenant-api):
//   GET    /events                 list organizer events
//   POST   /events                 create event
//   PATCH  /events/:id             update event
//   GET    /events/:id/tiers       list tiers
//   POST   /events/:id/tiers       create tier
//   PATCH  /tiers/:id              update tier
//   GET    /events/:id/orders      list orders for event
//   GET    /orders/:id             get order with tickets
//   GET    /events/:id/tickets     list tickets
//   POST   /checkin                { code }  → check in a ticket
//   GET    /webhooks               list endpoints
//   POST   /webhooks               { url, events[], description } → create
//   PATCH  /webhooks/:id           update
//   DELETE /webhooks/:id           remove
import { adminClient, corsHeaders, sha256Hex } from "../_shared/finalize.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token.startsWith("esk_")) return j({ error: "unauthorized" }, 401);

    const sb = adminClient();
    const hash = await sha256Hex(token);
    const { data: orgId } = await sb.rpc("verify_api_key_hash", { _hash: hash });
    if (!orgId) return j({ error: "invalid api key" }, 401);

    const url = new URL(req.url);
    const path = url.pathname.replace(/^.*\/tenant-api/, "") || "/";
    const seg = path.split("/").filter(Boolean);
    const m = req.method;

    // Helpers ensuring ownership
    const ownsEvent = async (id: string) => {
      const { data } = await sb.from("events").select("organizer_id").eq("id", id).maybeSingle();
      return data?.organizer_id === orgId;
    };

    // EVENTS
    if (seg[0] === "events" && seg.length === 1 && m === "GET") {
      const { data } = await sb.from("events").select("*").eq("organizer_id", orgId).order("created_at", { ascending: false });
      return j({ events: data });
    }
    if (seg[0] === "events" && seg.length === 1 && m === "POST") {
      const body = await req.json();
      const slug = (body.slug || (body.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + crypto.randomUUID().slice(0, 6));
      const { data, error } = await sb.from("events").insert({ ...body, slug, organizer_id: orgId }).select().single();
      if (error) return j({ error: error.message }, 400);
      return j({ event: data }, 201);
    }
    if (seg[0] === "events" && seg.length === 2 && m === "PATCH") {
      if (!(await ownsEvent(seg[1]))) return j({ error: "forbidden" }, 403);
      const body = await req.json();
      const { data, error } = await sb.from("events").update(body).eq("id", seg[1]).select().single();
      if (error) return j({ error: error.message }, 400);
      return j({ event: data });
    }
    if (seg[0] === "events" && seg[2] === "tiers" && m === "GET") {
      if (!(await ownsEvent(seg[1]))) return j({ error: "forbidden" }, 403);
      const { data } = await sb.from("ticket_tiers").select("*").eq("event_id", seg[1]).order("sort_order");
      return j({ tiers: data });
    }
    if (seg[0] === "events" && seg[2] === "tiers" && m === "POST") {
      if (!(await ownsEvent(seg[1]))) return j({ error: "forbidden" }, 403);
      const body = await req.json();
      const { data, error } = await sb.from("ticket_tiers").insert({ ...body, event_id: seg[1] }).select().single();
      if (error) return j({ error: error.message }, 400);
      return j({ tier: data }, 201);
    }
    if (seg[0] === "tiers" && seg.length === 2 && m === "PATCH") {
      const { data: tier } = await sb.from("ticket_tiers").select("event_id").eq("id", seg[1]).maybeSingle();
      if (!tier || !(await ownsEvent(tier.event_id))) return j({ error: "forbidden" }, 403);
      const body = await req.json();
      const { data, error } = await sb.from("ticket_tiers").update(body).eq("id", seg[1]).select().single();
      if (error) return j({ error: error.message }, 400);
      return j({ tier: data });
    }
    if (seg[0] === "events" && seg[2] === "orders" && m === "GET") {
      if (!(await ownsEvent(seg[1]))) return j({ error: "forbidden" }, 403);
      const { data } = await sb.from("orders").select("*").eq("event_id", seg[1]).order("created_at", { ascending: false });
      return j({ orders: data });
    }
    if (seg[0] === "orders" && seg.length === 2 && m === "GET") {
      const { data: order } = await sb.from("orders").select("*").eq("id", seg[1]).maybeSingle();
      if (!order) return j({ error: "not found" }, 404);
      if (!(await ownsEvent(order.event_id))) return j({ error: "forbidden" }, 403);
      const { data: tickets } = await sb.from("tickets").select("*").eq("order_id", seg[1]);
      return j({ order, tickets });
    }
    if (seg[0] === "events" && seg[2] === "tickets" && m === "GET") {
      if (!(await ownsEvent(seg[1]))) return j({ error: "forbidden" }, 403);
      const { data } = await sb.from("tickets").select("*").eq("event_id", seg[1]);
      return j({ tickets: data });
    }
    if (seg[0] === "checkin" && m === "POST") {
      const { code } = await req.json();
      if (!code) return j({ error: "code required" }, 400);
      const { data: ticket } = await sb.from("tickets").select("*, events!inner(organizer_id)").eq("code", code).maybeSingle();
      if (!ticket) return j({ ok: false, error: "ticket not found" }, 404);
      if ((ticket as any).events.organizer_id !== orgId) return j({ ok: false, error: "forbidden" }, 403);
      if (ticket.checked_in_at) return j({ ok: false, error: "already checked in", at: ticket.checked_in_at });
      const { data: order } = await sb.from("orders").select("status").eq("id", ticket.order_id).single();
      if (order?.status !== "paid") return j({ ok: false, error: "order not paid" }, 400);
      await sb.from("tickets").update({ checked_in_at: new Date().toISOString() }).eq("id", ticket.id);

      // enqueue ticket.checked_in webhooks
      const { data: eps } = await sb.from("webhook_endpoints").select("id,events").eq("organizer_id", orgId).eq("is_active", true);
      const payload = { type: "ticket.checked_in", created_at: new Date().toISOString(), data: { ticket_id: ticket.id, code, event_id: ticket.event_id } };
      const rows = (eps || []).filter((e: any) => (e.events || []).includes("ticket.checked_in"))
        .map((e: any) => ({ endpoint_id: e.id, event_type: "ticket.checked_in", payload }));
      if (rows.length) await sb.from("webhook_deliveries").insert(rows);
      return j({ ok: true, holder: ticket.holder_name });
    }

    // WEBHOOKS
    if (seg[0] === "webhooks" && seg.length === 1 && m === "GET") {
      const { data } = await sb.from("webhook_endpoints").select("*").eq("organizer_id", orgId);
      return j({ endpoints: data });
    }
    if (seg[0] === "webhooks" && seg.length === 1 && m === "POST") {
      const { url: hookUrl, events, description } = await req.json();
      if (!hookUrl) return j({ error: "url required" }, 400);
      const secret = "whsec_" + crypto.randomUUID().replace(/-/g, "");
      const { data, error } = await sb.from("webhook_endpoints").insert({
        organizer_id: orgId, url: hookUrl, secret,
        events: events || ["order.paid", "ticket.checked_in"],
        description,
      }).select().single();
      if (error) return j({ error: error.message }, 400);
      return j({ endpoint: data }, 201);
    }
    if (seg[0] === "webhooks" && seg.length === 2 && m === "PATCH") {
      const body = await req.json();
      const { data, error } = await sb.from("webhook_endpoints").update(body).eq("id", seg[1]).eq("organizer_id", orgId).select().single();
      if (error) return j({ error: error.message }, 400);
      return j({ endpoint: data });
    }
    if (seg[0] === "webhooks" && seg.length === 2 && m === "DELETE") {
      const { error } = await sb.from("webhook_endpoints").delete().eq("id", seg[1]).eq("organizer_id", orgId);
      if (error) return j({ error: error.message }, 400);
      return j({ ok: true });
    }

    return j({ error: "not found", path, method: m }, 404);
  } catch (e) {
    return j({ error: (e as Error).message }, 500);
  }
});

function j(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
