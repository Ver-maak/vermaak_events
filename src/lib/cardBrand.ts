// Card brand detection + validation helpers.
// Only the brand and last 4 digits ever leave the browser — the full card
// number is entered on the provider's secure hosted checkout page (PCI-safe).

export type CardBrand = "visa" | "mastercard" | "unknown";

export const BRAND_LABEL: Record<CardBrand, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  unknown: "Unsupported card",
};

/** Detects Visa / Mastercard from the leading digits (works while typing). */
export function detectCardBrand(input: string): CardBrand {
  const d = (input || "").replace(/\D/g, "");
  if (!d) return "unknown";
  if (/^4/.test(d)) return "visa";
  // Mastercard: 51-55 and the 2221-2720 range
  if (/^5[1-5]/.test(d)) return "mastercard";
  if (/^2/.test(d)) {
    const head = d.slice(0, 4).padEnd(4, "0");
    const n = Number(head);
    if (n >= 2221 && n <= 2720) return "mastercard";
  }
  return "unknown";
}

/** Luhn checksum. */
export function luhnValid(input: string): boolean {
  const d = (input || "").replace(/\D/g, "");
  if (d.length < 12) return false;
  let sum = 0;
  let dbl = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (dbl) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** Groups digits in blocks of 4 for display. */
export function formatCardNumber(input: string): string {
  const d = (input || "").replace(/\D/g, "").slice(0, 19);
  return d.replace(/(.{4})/g, "$1 ").trim();
}

export function cardLast4(input: string): string {
  return (input || "").replace(/\D/g, "").slice(-4);
}

export interface CardCheck {
  brand: CardBrand;
  last4: string;
  valid: boolean;
  error?: string;
}

export function validateCard(input: string): CardCheck {
  const d = (input || "").replace(/\D/g, "");
  const brand = detectCardBrand(d);
  const last4 = d.slice(-4);
  if (d.length < 13) return { brand, last4, valid: false, error: "Enter your full card number" };
  if (brand === "unknown") {
    return { brand, last4, valid: false, error: "Only Visa and Mastercard are accepted" };
  }
  const expected = brand === "visa" ? [13, 16, 19] : [16];
  if (!expected.includes(d.length)) {
    return { brand, last4, valid: false, error: `That doesn't look like a valid ${BRAND_LABEL[brand]} number` };
  }
  if (!luhnValid(d)) return { brand, last4, valid: false, error: "Card number is invalid" };
  return { brand, last4, valid: true };
}
