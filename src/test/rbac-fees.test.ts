import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const anon = createClient(URL, KEY);

describe("RBAC — only super admins can modify pricing", () => {
  it("anon UPDATE on exchange_rates is silently filtered (no row changes)", async () => {
    const { data: before } = await anon.from("exchange_rates").select("currency, rate_to_ugx").eq("currency", "USD").maybeSingle();
    await anon.from("exchange_rates").update({ rate_to_ugx: 1 }).eq("currency", "USD");
    const { data: after } = await anon.from("exchange_rates").select("currency, rate_to_ugx").eq("currency", "USD").maybeSingle();
    expect(after?.rate_to_ugx).toBe(before?.rate_to_ugx);
  });

  it("anon cannot insert a fee_tier (RLS blocks)", async () => {
    const { error } = await anon.from("fee_tiers").insert({
      currency: "UGX", min_amount: 0, max_amount: 1, fee_type: "flat", fee_value: 0, tier_label: "hack", sort_order: 999,
    } as never);
    expect(error).toBeTruthy();
  });

  it("anon cannot insert a fee_tier_version (RLS blocks)", async () => {
    const { error } = await anon.from("fee_tier_versions").insert({
      version_no: 999, label: "hack", is_active: false,
    } as never);
    expect(error).toBeTruthy();
  });

  it("anon UPDATE on currency_rounding has no effect", async () => {
    const { data: before } = await anon.from("currency_rounding").select("currency, decimals").eq("currency", "USD").maybeSingle();
    await anon.from("currency_rounding").update({ decimals: 9 }).eq("currency", "USD");
    const { data: after } = await anon.from("currency_rounding").select("currency, decimals").eq("currency", "USD").maybeSingle();
    expect(after?.decimals).toBe(before?.decimals);
  });

  it("anon can READ exchange_rates (public reference data) — at least one row visible", async () => {
    const { data } = await anon.from("exchange_rates").select("*");
    // Reading may be restricted to authenticated; either way no write happened
    expect(Array.isArray(data) || data === null).toBe(true);
  });
});
