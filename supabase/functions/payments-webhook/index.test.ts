// End-to-end behavioural tests for the webhook handler.
//
// These tests focus on the *parsing + dedupe contract* the handler relies on.
// Mocking the full Supabase client is heavy; instead we verify the pure logic
// (status normalisation + idempotency key derivation) against representative
// Swarmbyte webhook payloads. The handler invokes finalizePayment() which calls
// the idempotent `mark_order_paid_by_reference` RPC — so even if the dedupe row
// were missed, the database layer would still prevent double-fulfilment.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SwarmbyteProvider } from "../_shared/payments.ts";

Deno.test("webhook payload: terminal SUCCESS becomes a finalisable parsed event", () => {
  const payload = {
    transactionId: "TX-100",
    status: "SUCCESS",
    event: "collection.succeeded",
    amount: 5000,
    msisdn: "+256700000000",
  };
  const parsed = SwarmbyteProvider.parseWebhook(payload);
  assertEquals(parsed.status, "success");
  assertEquals(parsed.providerRef, "TX-100");
  // eventKey must be deterministic so processed_webhook_events dedupes correctly.
  assertEquals(parsed.eventKey, "collection.succeeded:TX-100");
});

Deno.test("webhook payload: PENDING event is non-terminal", () => {
  const parsed = SwarmbyteProvider.parseWebhook({
    transactionId: "TX-200", status: "INITIATED", event: "collection.initiated",
  });
  assertEquals(parsed.status, "pending");
});

Deno.test("webhook payload: FAILED event maps to failed", () => {
  const parsed = SwarmbyteProvider.parseWebhook({
    transactionId: "TX-300", status: "FAILED", event: "collection.failed",
  });
  assertEquals(parsed.status, "failed");
});

Deno.test("webhook payload: CANCELLED event maps to cancelled", () => {
  const parsed = SwarmbyteProvider.parseWebhook({
    transactionId: "TX-400", status: "CANCELLED", event: "collection.cancelled",
  });
  assertEquals(parsed.status, "cancelled");
});

Deno.test("webhook payload: missing transactionId returns empty providerRef so handler can 400", () => {
  const parsed = SwarmbyteProvider.parseWebhook({ status: "SUCCESS" });
  assertEquals(parsed.providerRef, "");
});

Deno.test("webhook payload: nested {data:{...}} shape (Swarmbyte alternative envelope)", () => {
  const parsed = SwarmbyteProvider.parseWebhook({
    data: { transactionId: "TX-500", status: "SUCCESS" },
    event: "collection.succeeded",
  });
  assertEquals(parsed.providerRef, "TX-500");
  assertEquals(parsed.status, "success");
});

Deno.test("verifySignature: always true (Swarmbyte webhooks are unsigned)", async () => {
  const cfg = {
    code: "swarmbyte", enabled: true, mode: "sandbox" as const,
    base_url: null, callback_url: null,
    redirect_success_url: null, redirect_cancel_url: null,
    credentials: {},
  };
  const ok = await SwarmbyteProvider.verifySignature(cfg, "{}", new Headers());
  assertEquals(ok, true);
});

Deno.test("dedupe: same delivery twice produces identical event_key (would 23505 in DB)", () => {
  const delivery = { transactionId: "TX-DEDUP", status: "SUCCESS", event: "collection.succeeded" };
  const a = SwarmbyteProvider.parseWebhook(delivery);
  const b = SwarmbyteProvider.parseWebhook({ ...delivery }); // retry
  assertEquals(a.eventKey, b.eventKey);
  // In the handler this causes processed_webhook_events.insert() to raise PG
  // error 23505 (unique violation), which the handler maps to {ok:true,duplicate:true}.
});

Deno.test("polling contract: verify() returns 'pending' until the gateway resolves", async () => {
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith("/token")) {
      return Promise.resolve(new Response(JSON.stringify({ access_token: "t", expires_in: 600 }),
        { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    calls++;
    const status = calls < 3 ? "PENDING" : "SUCCESS";
    return Promise.resolve(new Response(JSON.stringify({ data: { status, transactionId: "TX-POLL" } }),
      { status: 200, headers: { "Content-Type": "application/json" } }));
  };
  try {
    const cfg = {
      code: "swarmbyte", enabled: true, mode: "sandbox" as const,
      base_url: "https://core.swarmbyte.com", callback_url: null,
      redirect_success_url: null, redirect_cancel_url: null,
      credentials: { api_key: "id-poll", api_secret: "secret", wallet_address: "WAL" },
    };
    const a = await SwarmbyteProvider.verify(cfg, "TX-POLL");
    const b = await SwarmbyteProvider.verify(cfg, "TX-POLL");
    const c = await SwarmbyteProvider.verify(cfg, "TX-POLL");
    assertEquals(a.status, "pending");
    assertEquals(b.status, "pending");
    assertEquals(c.status, "success");
  } finally {
    globalThis.fetch = original;
  }
});
