// Maps raw provider/edge function error strings to friendly, actionable copy.
// Used by the checkout dialog so buyers see a clear reason + next step.

export type PaymentFailureKind =
  | "insufficient_funds"
  | "wrong_pin"
  | "timeout"
  | "cancelled"
  | "invalid_phone"
  | "provider_unavailable"
  | "unauthorized"
  | "amount_invalid"
  | "duplicate"
  | "network"
  | "unknown";

export interface FriendlyFailure {
  kind: PaymentFailureKind;
  title: string;
  description: string;
  /** True when the action that makes sense is "try again". False = contact support. */
  retryable: boolean;
}

const MAP: Array<{ test: RegExp; kind: PaymentFailureKind; title: string; description: string; retryable: boolean }> = [
  { test: /insufficient|balance|funds/i, kind: "insufficient_funds", title: "Insufficient balance",
    description: "Your mobile money wallet doesn't have enough funds. Top up and try again.", retryable: true },
  { test: /pin|incorrect|invalid pin|wrong pin/i, kind: "wrong_pin", title: "Wrong PIN entered",
    description: "The PIN you entered on your phone was rejected. Try the payment again.", retryable: true },
  { test: /cancel/i, kind: "cancelled", title: "Payment cancelled",
    description: "You cancelled the request on your phone. You can try again whenever you're ready.", retryable: true },
  { test: /time(d)? *out|timeout|expired/i, kind: "timeout", title: "Confirmation timed out",
    description: "We didn't receive a confirmation in time. If you already approved the prompt, use 'Check status' to verify.", retryable: true },
  { test: /phone|msisdn|number/i, kind: "invalid_phone", title: "Invalid phone number",
    description: "The mobile money number isn't valid for the selected provider. Double-check and retry.", retryable: true },
  { test: /unauthorized|forbidden|401|403/i, kind: "unauthorized", title: "Session expired",
    description: "Please sign in again to complete the purchase.", retryable: false },
  { test: /amount|minimum|≥ 500|>= 500/i, kind: "amount_invalid", title: "Amount not allowed",
    description: "The amount is below the provider minimum or in an unsupported currency.", retryable: false },
  { test: /duplicate|already/i, kind: "duplicate", title: "Already processed",
    description: "This order has already been completed. Refreshing your tickets…", retryable: false },
  { test: /network|fetch|connection|ENOTFOUND|ECONNRESET/i, kind: "network", title: "Network problem",
    description: "We couldn't reach the payment provider. Check your connection and try again.", retryable: true },
  { test: /not configured|missing|credentials|wallet_address|api_key|api_secret|Payment Settings/i, kind: "provider_unavailable", title: "Payment provider not set up",
    description: "Ask an admin to finish provider setup in Admin → Payment Settings, then try again.", retryable: false },
  { test: /provider|swarmbyte|disabled|502|503|504/i, kind: "provider_unavailable", title: "Provider unavailable",
    description: "The payment provider is temporarily unreachable. Try again in a moment.", retryable: true },
];

export function explainPaymentError(input: unknown): FriendlyFailure {
  const msg = typeof input === "string" ? input : (input as { message?: string })?.message || "";
  for (const m of MAP) {
    if (m.test.test(msg)) {
      return { kind: m.kind, title: m.title, description: m.description, retryable: m.retryable };
    }
  }
  return {
    kind: "unknown",
    title: "Payment didn't go through",
    description: msg || "Something went wrong. Try again, or use 'Check status' if you already approved the prompt.",
    retryable: true,
  };
}

export async function getFunctionErrorMessage(error: unknown, fallback = "Request failed") {
  const fnError = error as { message?: string; context?: { json?: () => Promise<unknown>; text?: () => Promise<string> } };

  try {
    const body = await fnError?.context?.json?.();
    const message = (body as { error?: string; message?: string })?.error || (body as { message?: string })?.message;
    if (message) return message;
  } catch (_) {
    try {
      const text = await fnError?.context?.text?.();
      if (text) return text;
    } catch (_) {
      // fall through to the SDK message below
    }
  }

  return fnError?.message || fallback;
}
