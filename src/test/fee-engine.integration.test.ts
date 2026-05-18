import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const anon = createClient(URL, KEY);

const estimate = async (amount: number, currency: string) => {
  const { data, error } = await anon.functions.invoke("estimate-fee", { body: { amount, currency } });
  if (error) throw error;
  return data as { fee: number; fee_ugx: number; tier_label: string; exchange_rate: number };
};

describe("Fee engine — UGX tiers (spec)", () => {
  it("UGX 0–60,000 → flat 500", async () => {
    const r = await estimate(50000, "UGX");
    expect(r.fee).toBe(500);
  });
  it("UGX 60,001–200,000 → flat 1,000", async () => {
    const r = await estimate(150000, "UGX");
    expect(r.fee).toBe(1000);
  });
  it("UGX 200,001–1,000,000 → 0.6% with min 1,500 / max 6,000", async () => {
    expect((await estimate(200001, "UGX")).fee).toBe(1500); // min floor
    expect(Number((await estimate(500000, "UGX")).fee)).toBe(3000); // 0.6%
    expect((await estimate(1000000, "UGX")).fee).toBe(6000); // max cap
  });
  it("UGX 1M–5M → 0.5% with min 6,000 / max 20,000", async () => {
    expect((await estimate(1000001, "UGX")).fee).toBe(6000);
    expect(Number((await estimate(2000000, "UGX")).fee)).toBe(10000);
    expect((await estimate(5000000, "UGX")).fee).toBe(20000);
  });
  it("UGX 5M–20M → 0.4% with min 20,000 / max 60,000", async () => {
    expect((await estimate(5000001, "UGX")).fee).toBe(20000);
    expect(Number((await estimate(10000000, "UGX")).fee)).toBe(40000);
    expect((await estimate(20000000, "UGX")).fee).toBe(60000);
  });
  it("UGX 20M+ → 0.3% capped at 150,000", async () => {
    expect(Number((await estimate(25000000, "UGX")).fee)).toBe(75000);
    expect((await estimate(100000000, "UGX")).fee).toBe(150000); // cap
  });
});

describe("Fee engine — multi-currency conversion", () => {
  it("USD converts via rate 3,750 and computes fee in UGX then back to USD", async () => {
    const r = await estimate(100, "USD"); // 100 USD = 375,000 UGX → 0.6% = 2,250 UGX → /3750 = 0.60 USD
    expect(r.exchange_rate).toBe(3750);
    expect(r.fee_ugx).toBe(2250);
    expect(Number(r.fee)).toBeCloseTo(0.6, 2);
  });
  it("EUR uses configured 4,000 rate", async () => {
    const r = await estimate(50, "EUR"); // 200,000 UGX → flat 1,000 UGX → 0.25 EUR
    expect(r.exchange_rate).toBe(4000);
    expect(Number(r.fee)).toBeCloseTo(0.25, 2);
  });
});

describe("Storage policy — org-databases bucket", () => {
  it("denies anonymous upload", async () => {
    const blob = new Blob(["x"], { type: "text/plain" });
    const { error } = await anon.storage.from("org-databases").upload(`anon-${Date.now()}.txt`, blob);
    expect(error).toBeTruthy();
  });
  it("denies anonymous delete", async () => {
    const { error } = await anon.storage.from("org-databases").remove(["any/path.txt"]);
    expect(error).toBeTruthy();
  });
  it("denies anonymous list", async () => {
    const { data, error } = await anon.storage.from("org-databases").list();
    // Either error or empty result (RLS hides objects)
    expect(error || (Array.isArray(data) && data.length === 0)).toBeTruthy();
  });
});
