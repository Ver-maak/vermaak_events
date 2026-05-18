import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const anon = createClient(URL, KEY);

const ORG_A = "00000000-0000-0000-0000-00000000feea";
const ORG_B = "00000000-0000-0000-0000-00000000feeb";

const estimate = async (amount: number, currency: string, organization_id?: string) => {
  const { data, error } = await anon.functions.invoke("estimate-fee", {
    body: { amount, currency, organization_id },
  });
  if (error) throw error;
  return data as { fee: number; tier_label: string };
};

describe("Tenant-level fee tier isolation", () => {
  it("Tenant A pays its own premium override (2,000)", async () => {
    const r = await estimate(50000, "UGX", ORG_A);
    expect(r.fee).toBe(2000);
    expect(r.tier_label).toMatch(/Tenant A/);
  });

  it("Tenant B pays its own discount override (100)", async () => {
    const r = await estimate(50000, "UGX", ORG_B);
    expect(r.fee).toBe(100);
    expect(r.tier_label).toMatch(/Tenant B/);
  });

  it("Tenants do not bleed into each other", async () => {
    const a = await estimate(50000, "UGX", ORG_A);
    const b = await estimate(50000, "UGX", ORG_B);
    expect(a.fee).not.toBe(b.fee);
  });

  it("Unknown / no org falls back to global tier (500)", async () => {
    const r = await estimate(50000, "UGX");
    expect(r.fee).toBe(500);
  });
});
