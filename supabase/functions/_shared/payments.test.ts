// Integration tests for the Swarmbyte payment adapter.
//
// These tests fully mock the network (`globalThis.fetch`) so they run with no
// external dependency, no Supabase, and no real Swarmbyte account. They verify:
//
//   * /v1/collect is called with the correct payload + X-Idempotency-Key
//   * status normalisation handles every documented Swarmbyte value
//   * verify() polls /v1/collect/transactions/:id and parses status
//   * parseWebhook() produces a stable, deduplicable eventKey
//
// Run via the Lovable test tool — it executes `deno test --allow-net --allow-env`.

import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SwarmbyteProvider, type ProviderConfig } from "./payments.ts";

const baseCfg: ProviderConfig = {
  code: "swarmbyte",
  enabled: true,
  mode: "sandbox",
  base_url: "https://core.swarmbyte.com",
  callback_url: null,
  redirect_success_url: null,
  redirect_cancel_url: null,
  credentials: { api_key: "test-id", api_secret: "test-secret", wallet_address: "WAL-TEST" },
};

interface FetchCall { url: string; init: RequestInit }

function installFetchMock(handler: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const call: FetchCall = { url, init: init || {} };
    calls.push(call);
    return Promise.resolve(handler(call));
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.test("Swarmbyte initiate sends correct payload and idempotency key", async () => {
  const mock = installFetchMock((call) => {
    if (call.url.endsWith("/v1/oauth/collections/token")) {
      return jsonResp({ access_token: "tok-123", expires_in: 600 });
    }
    if (call.url.endsWith("/v1/collect")) {
      return jsonResp({ data: { transactionId: "TX-ABC-001", status: "PENDING" } }, 202);
    }
    return jsonResp({ error: "unexpected" }, 500);
  });
  try {
    const result = await SwarmbyteProvider.initiate(baseCfg, {
      orderId: "ord-1",
      intentId: "intent-1",
      amount: 5000,
      currency: "UGX",
      buyer: { name: "Test", email: "t@x.com", phone: "+256 700 000 000" },
      callbackUrl: "https://cb.example.com/webhook",
      idempotencyKey: "intent-1",
    });
    assertEquals(result.providerRef, "TX-ABC-001");
    assertEquals(result.awaitConfirmation, true);

    const collectCall = mock.calls.find((c) => c.url.endsWith("/v1/collect"))!;
    const headers = new Headers(collectCall.init.headers);
    assertEquals(headers.get("X-Idempotency-Key"), "intent-1");
    assertEquals(headers.get("Authorization"), "Bearer tok-123");

    const body = JSON.parse(collectCall.init.body as string);
    assertEquals(body.walletAddress, "WAL-TEST");
    assertEquals(body.msisdn, "256700000000");
    assertEquals(body.amount, 5000);
    assertEquals(body.reference, "ord-1");
    assertEquals(body.webhookUrl, "https://cb.example.com/webhook");
  } finally {
    mock.restore();
  }
});

Deno.test("Swarmbyte initiate rejects sub-minimum UGX amounts", async () => {
  const mock = installFetchMock(() => jsonResp({}, 200));
  try {
    await assertRejects(
      () => SwarmbyteProvider.initiate(baseCfg, {
        orderId: "ord-2", amount: 100, currency: "UGX",
        buyer: { name: "x", email: "x@x.com", phone: "+256700000000" },
        callbackUrl: "https://cb",
      }),
      Error,
      "≥ 500",
    );
  } finally {
    mock.restore();
  }
});

Deno.test("Swarmbyte initiate rejects non-UGX currency", async () => {
  const mock = installFetchMock(() => jsonResp({}));
  try {
    await assertRejects(
      () => SwarmbyteProvider.initiate(baseCfg, {
        orderId: "ord-3", amount: 5000, currency: "USD",
        buyer: { name: "x", email: "x@x.com", phone: "+256700000000" },
        callbackUrl: "https://cb",
      }),
      Error,
      "UGX",
    );
  } finally {
    mock.restore();
  }
});

Deno.test("Swarmbyte verify normalises every documented status", async () => {
  for (const [api, expected] of [
    ["SUCCESS", "success"], ["COMPLETED", "success"], ["PAID", "success"],
    ["FAILED", "failed"], ["ERROR", "failed"],
    ["CANCELLED", "cancelled"], ["CANCELED", "cancelled"],
    ["PENDING", "pending"], ["INITIATED", "pending"],
  ] as const) {
    const mock = installFetchMock((call) => {
      if (call.url.endsWith("/token")) return jsonResp({ access_token: "t", expires_in: 600 });
      return jsonResp({ data: { status: api } });
    });
    try {
      const v = await SwarmbyteProvider.verify(baseCfg, "TX-1");
      assertEquals(v.status, expected, `expected ${api} → ${expected}`);
    } finally { mock.restore(); }
  }
});

Deno.test("Swarmbyte parseWebhook produces deduplicable eventKey", () => {
  const a = SwarmbyteProvider.parseWebhook({ transactionId: "TX-9", status: "SUCCESS", event: "collection.succeeded" });
  const b = SwarmbyteProvider.parseWebhook({ transactionId: "TX-9", status: "SUCCESS", event: "collection.succeeded" });
  assertEquals(a.eventKey, b.eventKey, "duplicate deliveries hash to same key");
  assertEquals(a.providerRef, "TX-9");
  assertEquals(a.status, "success");

  const nested = SwarmbyteProvider.parseWebhook({ data: { transactionId: "TX-10", status: "FAILED" } });
  assertEquals(nested.providerRef, "TX-10");
  assertEquals(nested.status, "failed");
});

Deno.test("Swarmbyte retries on 5xx then succeeds", async () => {
  let attempts = 0;
  const mock = installFetchMock((call) => {
    if (call.url.endsWith("/token")) {
      attempts++;
      if (attempts < 2) return jsonResp({ error: "upstream" }, 503);
      return jsonResp({ access_token: "tok-retry", expires_in: 600 });
    }
    return jsonResp({ data: { transactionId: "TX-RETRY", status: "PENDING" } }, 202);
  });
  try {
    const result = await SwarmbyteProvider.initiate({ ...baseCfg, credentials: { ...baseCfg.credentials, api_key: "retry-id" } }, {
      orderId: "ord-r", amount: 1000, currency: "UGX",
      buyer: { name: "r", email: "r@x.com", phone: "+256700000001" },
      callbackUrl: "https://cb",
    });
    assertEquals(result.providerRef, "TX-RETRY");
    assertEquals(attempts >= 2, true, "should have retried token endpoint");
  } finally { mock.restore(); }
});

Deno.test("Swarmbyte webhook dedupe — same eventKey on duplicate deliveries", () => {
  const delivery1 = { transactionId: "TX-DUP", status: "SUCCESS", event: "collection.succeeded" };
  const delivery2 = { ...delivery1 }; // identical retry
  const p1 = SwarmbyteProvider.parseWebhook(delivery1);
  const p2 = SwarmbyteProvider.parseWebhook(delivery2);
  assertEquals(p1.eventKey, p2.eventKey);

  // A second event for the same transaction (e.g. terminal failure follow-up)
  // should NOT collide with the success delivery.
  const failedFollowUp = SwarmbyteProvider.parseWebhook({
    transactionId: "TX-DUP", status: "FAILED", event: "collection.failed",
  });
  if (failedFollowUp.eventKey === p1.eventKey) {
    throw new Error("Different events must have different eventKeys");
  }
});
