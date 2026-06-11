// Provider-agnostic payment layer.
// Swarmbyte (https://docs.swarmbyte.com) adapter implementing the PaymentProvider
// interface. The architecture is provider-agnostic so additional providers can be
// added by implementing the interface and registering them in REGISTRY.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-signature, x-swarmbyte-signature, x-swarmbyte-timestamp",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export const adminClient = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export function encKey(): string {
  const k = Deno.env.get("PAYMENT_CREDS_KEY");
  if (!k) throw new Error("PAYMENT_CREDS_KEY not configured");
  return k;
}

export interface ProviderConfig {
  code: string;
  enabled: boolean;
  mode: "sandbox" | "live";
  base_url?: string | null;
  callback_url?: string | null;
  redirect_success_url?: string | null;
  redirect_cancel_url?: string | null;
  credentials: Record<string, string>;
}

export interface InitiateInput {
  orderId: string;
  intentId?: string;
  amount: number;
  currency: string;
  buyer: { name: string; email: string; phone?: string };
  callbackUrl: string;
  redirectSuccessUrl?: string;
  redirectCancelUrl?: string;
  /** Idempotency key used for retry-safe collect calls. */
  idempotencyKey?: string;
}
export interface InitiateResult {
  providerRef: string;
  /** Redirect-style flow (not used by STK-push providers like Swarmbyte). */
  redirectUrl?: string;
  /** STK-push providers: tells the UI to poll status instead of redirect. */
  awaitConfirmation?: boolean;
  message?: string;
  raw?: unknown;
}
export interface VerifyResult {
  status: "pending" | "success" | "failed" | "cancelled";
  raw?: unknown;
}
export interface WebhookParsed {
  providerRef: string;
  status: "success" | "failed" | "cancelled" | "pending";
  /** Stable dedupe key written to processed_webhook_events. */
  eventKey: string;
}

export interface PaymentProvider {
  code: string;
  testConnection(cfg: ProviderConfig): Promise<{ ok: boolean; message: string }>;
  initiate(cfg: ProviderConfig, input: InitiateInput): Promise<InitiateResult>;
  verify(cfg: ProviderConfig, providerRef: string): Promise<VerifyResult>;
  /**
   * Swarmbyte webhooks are NOT signed (docs explicitly state: "HTTP callbacks from
   * SwarmByte to your webhookUrl are not signed"). Adapters for providers that DO
   * sign should validate here and return false on mismatch.
   */
  verifySignature(cfg: ProviderConfig, rawBody: string, headers: Headers): Promise<boolean>;
  parseWebhook(body: unknown): WebhookParsed;
}

// HMAC helper (kept for future signed providers)
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---------------- Swarmbyte ----------------
// Reference: https://docs.swarmbyte.com/
//   * Token:   POST /v1/oauth/collections/token  (client_credentials)
//   * Collect: POST /v1/collect  (Bearer + X-Idempotency-Key)
//   * Status:  GET  /v1/collect/transactions/:transactionId
//   * Webhook: UNSIGNED — rely on HTTPS + unguessable path + idempotent processing
// Default base URL is https://core.swarmbyte.com (Swarmbyte does not document a
// separate sandbox host — the merchant dashboard provisions sandbox credentials
// against the same host).

const SWARMBYTE_DEFAULT_BASE = "https://stg-api.swarmbyte.com";

type CachedToken = { token: string; exp: number };
const tokenCache = new Map<string, CachedToken>();

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: { retries?: number; baseDelayMs?: number } = {},
): Promise<Response> {
  const retries = opts.retries ?? 2;
  const baseDelay = opts.baseDelayMs ?? 400;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status === 429 || (res.status >= 500 && res.status !== 501)) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt)));
          continue;
        }
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt)));
        continue;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Network error");
}

async function swarmbyteToken(cfg: ProviderConfig): Promise<string> {
  const base = (cfg.base_url || SWARMBYTE_DEFAULT_BASE).replace(/\/+$/, "");
  const clientId = cfg.credentials.api_key || cfg.credentials.public_key || "";
  const clientSecret = cfg.credentials.api_secret || cfg.credentials.secret_key || "";
  if (!clientId || !clientSecret) throw new Error("Swarmbyte api_key / api_secret not configured");

  const cacheKey = `${base}|${clientId}|collections`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.exp - 30_000 > Date.now()) return cached.token;

  const res = await fetchWithRetry(`${base}/v1/oauth/collections/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.access_token) {
    throw new Error(data?.message || `Swarmbyte token failed (${res.status})`);
  }
  const expiresIn = Number(data.expires_in || 600);
  tokenCache.set(cacheKey, { token: data.access_token, exp: Date.now() + expiresIn * 1000 });
  return data.access_token as string;
}

function normalizeSwarmbyteStatus(s: unknown): VerifyResult["status"] {
  const v = String(s ?? "").toUpperCase();
  if (v === "SUCCESS" || v === "SUCCESSFUL" || v === "COMPLETED" || v === "PAID") return "success";
  if (v === "FAILED" || v === "ERROR") return "failed";
  if (v === "CANCELLED" || v === "CANCELED") return "cancelled";
  return "pending";
}

export const SwarmbyteProvider: PaymentProvider = {
  code: "swarmbyte",

  async testConnection(cfg) {
    try {
      const token = await swarmbyteToken(cfg);
      return { ok: true, message: `Token issued (${token.slice(0, 8)}…)` };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  },

  async initiate(cfg, input) {
    if (input.currency !== "UGX") {
      throw new Error("Swarmbyte collections only support UGX");
    }
    const amount = Math.round(Number(input.amount));
    if (!Number.isFinite(amount) || amount < 500) {
      throw new Error("Amount must be an integer ≥ 500 UGX");
    }
    const phone = (input.buyer.phone || "").replace(/[^\d+]/g, "");
    if (!phone) throw new Error("Buyer phone (msisdn) is required for Swarmbyte");
    const walletAddress = cfg.credentials.wallet_address || cfg.credentials.merchant_id || "";
    if (!walletAddress) throw new Error("Swarmbyte wallet_address not configured");

    const base = (cfg.base_url || SWARMBYTE_DEFAULT_BASE).replace(/\/+$/, "");
    const token = await swarmbyteToken(cfg);
    const idempotencyKey = (input.idempotencyKey || `${input.orderId}:${input.intentId || ""}`).slice(0, 200);

    const body = {
      walletAddress,
      msisdn: phone,
      amount,
      reference: input.orderId,
      webhookUrl: input.callbackUrl,
    };

    const res = await fetchWithRetry(`${base}/v1/collect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status !== 202 && !res.ok) {
      throw new Error(data?.message || `Swarmbyte collect failed (${res.status})`);
    }
    const payload = data?.data ?? data;
    const transactionId = payload?.transactionId || payload?.id;
    if (!transactionId) throw new Error("Swarmbyte did not return a transactionId");

    return {
      providerRef: String(transactionId),
      awaitConfirmation: true,
      message: "STK push sent. Approve the prompt on your phone to complete payment.",
      raw: data,
    };
  },

  async verify(cfg, providerRef) {
    const base = (cfg.base_url || SWARMBYTE_DEFAULT_BASE).replace(/\/+$/, "");
    const token = await swarmbyteToken(cfg);
    const res = await fetchWithRetry(
      `${base}/v1/collect/transactions/${encodeURIComponent(providerRef)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const data = await res.json().catch(() => ({}));
    const payload = data?.data ?? data;
    return { status: normalizeSwarmbyteStatus(payload?.status), raw: data };
  },

  async verifySignature(_cfg, _rawBody, _headers) {
    // Swarmbyte webhooks are unsigned by design. Safety relies on:
    //  - HTTPS-only callback URL (Swarmbyte rejects non-HTTPS)
    //  - Unguessable function path (Supabase function URL + provider query param)
    //  - Idempotent processing keyed by transactionId in processed_webhook_events
    return true;
  },

  parseWebhook(body: any) {
    const providerRef = String(body?.transactionId || body?.data?.transactionId || "");
    const status = normalizeSwarmbyteStatus(body?.status ?? body?.data?.status);
    const event = String(body?.event || "transaction.updated");
    return { providerRef, status, eventKey: `${event}:${providerRef}` };
  },
};

const REGISTRY: Record<string, PaymentProvider> = {
  swarmbyte: SwarmbyteProvider,
};

export function getProvider(code: string): PaymentProvider {
  const p = REGISTRY[code];
  if (!p) throw new Error(`Unknown payment provider: ${code}`);
  return p;
}

export async function loadProviderConfig(code: string): Promise<ProviderConfig> {
  const sb = adminClient();
  const { data, error } = await sb.rpc("get_payment_provider_decrypted", {
    _code: code,
    _enc_key: encKey(),
  });
  if (error) throw error;
  if (!data) throw new Error(`Provider ${code} not configured`);
  return data as ProviderConfig;
}

export async function logCall(args: {
  provider_code: string;
  direction: "outbound" | "inbound";
  endpoint?: string;
  status_code?: number;
  request?: unknown;
  response?: unknown;
  order_id?: string | null;
  intent_id?: string | null;
}) {
  try {
    const sb = adminClient();
    await sb.from("payment_logs").insert({
      provider_code: args.provider_code,
      direction: args.direction,
      endpoint: args.endpoint ?? null,
      status_code: args.status_code ?? null,
      request: args.request ?? null,
      response: args.response ?? null,
      order_id: args.order_id ?? null,
      intent_id: args.intent_id ?? null,
    });
  } catch (_) { /* swallow */ }
}
