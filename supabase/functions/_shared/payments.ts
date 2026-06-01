// Provider-agnostic payment layer.
// Adapters implement the PaymentProvider interface. SwarmbyteProvider is a stub
// with TODO blocks to fill in with actual API details (endpoints, signature scheme).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-signature, x-swarmbyte-signature",
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
  amount: number;
  currency: string;
  buyer: { name: string; email: string; phone?: string };
  callbackUrl: string;
  redirectSuccessUrl?: string;
  redirectCancelUrl?: string;
}
export interface InitiateResult {
  providerRef: string;
  redirectUrl?: string;
  raw?: unknown;
}
export interface VerifyResult {
  status: "pending" | "success" | "failed" | "cancelled";
  raw?: unknown;
}
export interface WebhookParsed {
  providerRef: string;
  status: "success" | "failed" | "cancelled";
}

export interface PaymentProvider {
  code: string;
  testConnection(cfg: ProviderConfig): Promise<{ ok: boolean; message: string }>;
  initiate(cfg: ProviderConfig, input: InitiateInput): Promise<InitiateResult>;
  verify(cfg: ProviderConfig, providerRef: string): Promise<VerifyResult>;
  verifySignature(cfg: ProviderConfig, rawBody: string, headers: Headers): Promise<boolean>;
  parseWebhook(body: unknown): WebhookParsed;
}

// HMAC helper (commonly used by providers)
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

// ---------------- Swarmbyte stub ----------------
// TODO(swarmbyte): replace placeholder URLs/fields once Swarmbyte API docs are provided:
//   - initiate-payment endpoint + request body
//   - verify-payment endpoint
//   - webhook signature header + algorithm + signed payload
export const SwarmbyteProvider: PaymentProvider = {
  code: "swarmbyte",

  async testConnection(cfg) {
    const base = cfg.base_url || "";
    if (!base) return { ok: false, message: "Base URL not set" };
    if (!cfg.credentials.secret_key) return { ok: false, message: "Secret key missing" };
    try {
      // TODO: replace with real Swarmbyte ping/health endpoint
      const r = await fetch(`${base.replace(/\/+$/, "")}/health`, {
        headers: { Authorization: `Bearer ${cfg.credentials.secret_key}` },
      });
      return { ok: r.ok, message: r.ok ? `Reached ${base} (${r.status})` : `HTTP ${r.status}` };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  },

  async initiate(cfg, input) {
    const base = cfg.base_url || "";
    // TODO(swarmbyte): use real endpoint + body schema
    const body = {
      amount: input.amount,
      currency: input.currency,
      reference: input.orderId,
      customer: input.buyer,
      callback_url: input.callbackUrl,
      redirect_success_url: input.redirectSuccessUrl,
      redirect_cancel_url: input.redirectCancelUrl,
      merchant_id: cfg.credentials.merchant_id,
      mode: cfg.mode,
    };
    const r = await fetch(`${base.replace(/\/+$/, "")}/payments/initiate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.credentials.secret_key}`,
      },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.message || `Initiate failed (${r.status})`);
    return {
      providerRef: data.reference || data.id || data.transaction_id || crypto.randomUUID(),
      redirectUrl: data.checkout_url || data.redirect_url,
      raw: data,
    };
  },

  async verify(cfg, providerRef) {
    const base = cfg.base_url || "";
    const r = await fetch(`${base.replace(/\/+$/, "")}/payments/${encodeURIComponent(providerRef)}`, {
      headers: { Authorization: `Bearer ${cfg.credentials.secret_key}` },
    });
    const data = await r.json().catch(() => ({}));
    const s = String(data.status || "").toLowerCase();
    const status: VerifyResult["status"] =
      s === "success" || s === "successful" || s === "paid" ? "success" :
      s === "failed" ? "failed" :
      s === "cancelled" || s === "canceled" ? "cancelled" : "pending";
    return { status, raw: data };
  },

  async verifySignature(cfg, rawBody, headers) {
    const secret = cfg.credentials.webhook_secret;
    if (!secret) return false;
    const provided = headers.get("x-swarmbyte-signature") || headers.get("x-signature") || "";
    // TODO(swarmbyte): confirm signature scheme. Assuming HMAC-SHA256(rawBody) hex.
    const expected = await hmacSha256Hex(secret, rawBody);
    return timingSafeEqual(provided.replace(/^sha256=/, ""), expected);
  },

  parseWebhook(body: any) {
    const providerRef = body?.reference || body?.id || body?.transaction_id || "";
    const s = String(body?.status || "").toLowerCase();
    const status: WebhookParsed["status"] =
      s === "success" || s === "successful" || s === "paid" ? "success" :
      s === "cancelled" || s === "canceled" ? "cancelled" : "failed";
    return { providerRef, status };
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
