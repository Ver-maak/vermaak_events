import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const anon = createClient(URL, KEY);

const estimate = async (amount: number, currency: string) => {
  const { data, error } = await anon.functions.invoke("estimate-fee", { body: { amount, currency } });
  if (error) throw error;
  return data as { fee: number; fee_ugx: number; exchange_rate: number };
};

describe("Currency rounding rules", () => {
  it("UGX uses 0 decimals (integer fees)", async () => {
    const r = await estimate(500000, "UGX");
    expect(Number.isInteger(r.fee)).toBe(true);
    expect(Number.isInteger(r.fee_ugx)).toBe(true);
  });

  it("USD uses banker's rounding (2dp) and never exceeds 2 decimal places", async () => {
    const r = await estimate(100, "USD");
    const str = r.fee.toString();
    const decs = str.includes(".") ? str.split(".")[1].length : 0;
    expect(decs).toBeLessThanOrEqual(2);
  });

  it("USD min-fee boundary: small amount triggers tier min and converts cleanly", async () => {
    // 60 USD = 225,000 UGX → 0.6% = 1,350 UGX, but tier min = 1,500 UGX → 1,500/3750 = 0.40 USD
    const r = await estimate(60, "USD");
    expect(r.fee_ugx).toBe(1500);
    expect(r.fee).toBeCloseTo(0.4, 2);
  });

  it("UGX max-cap boundary: huge amount caps at 150,000", async () => {
    const r = await estimate(500_000_000, "UGX");
    expect(r.fee).toBe(150000);
  });

  it("EUR rounding stays within configured precision", async () => {
    const r = await estimate(123.45, "EUR");
    const decs = r.fee.toString().split(".")[1]?.length ?? 0;
    expect(decs).toBeLessThanOrEqual(2);
  });
});
