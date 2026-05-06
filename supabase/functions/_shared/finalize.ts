// Shared helpers for MoMo finalization + outbound webhook dispatch
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-enventsuite-signature",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
};

export const adminClient = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(message: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Finalize a payment intent: update order via RPC and enqueue outbound webhooks
export async function finalizePayment(providerRef: string, status: "success" | "failed" | "cancelled", raw: any) {
  const sb = adminClient();
  const { data, error } = await sb.rpc("mark_order_paid_by_reference", {
    _provider_ref: providerRef, _status: status, _raw: raw,
  });
  if (error) throw error;
  const result = data as any;
  if (!result?.ok) return result;

  if (status === "success" && result.order_id) {
    await enqueueOrderPaid(sb, result.order_id, result.event_id);
  }
  return result;
}

async function enqueueOrderPaid(sb: any, orderId: string, eventId: string) {
  const [{ data: order }, { data: tickets }, { data: ev }] = await Promise.all([
    sb.from("orders").select("*").eq("id", orderId).single(),
    sb.from("tickets").select("id,code,holder_name,tier_id").eq("order_id", orderId),
    sb.from("events").select("id,title,organizer_id").eq("id", eventId).single(),
  ]);
  if (!ev?.organizer_id) return;
  const { data: endpoints } = await sb.from("webhook_endpoints")
    .select("id,events").eq("organizer_id", ev.organizer_id).eq("is_active", true);

  const payload = {
    type: "order.paid",
    created_at: new Date().toISOString(),
    data: { order, tickets, event: ev },
  };
  const rows = (endpoints || [])
    .filter((e: any) => (e.events || []).includes("order.paid"))
    .map((e: any) => ({ endpoint_id: e.id, event_type: "order.paid", payload }));
  if (rows.length) {
    await sb.from("webhook_deliveries").insert(rows);
    // Fire-and-forget dispatch
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/dispatch-webhooks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    }).catch(() => {});
  }
}
