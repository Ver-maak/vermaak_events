# Fee Engine v2: Rounding, Versioning, Tenant Overrides, FeeBreakdown wiring & RBAC tests

## 1. Currency rounding rules (DB)
- Add `currency_rounding` table: `currency`, `decimals`, `rounding_mode` ('bankers'|'half_up'|'half_even'|'down'), `min_unit`.
- Seed: UGX → 0 decimals, half_up, min 1; USD/EUR/GBP → 2 decimals bankers; KES → 2 half_up; TZS → 0 half_up.
- Update `calculate_transaction_fee` to apply rounding when converting fee back to original currency (banker's rounding via SQL helper `round_currency(_amount, _currency)`).
- Enforce min/max fee at the rounded boundary (apply caps before rounding; re-clamp after).
- Vitest unit tests in `src/test/rounding.test.ts` calling `estimate-fee` for representative amounts (USD 0.005 → bankers 0.00; 0.015 → 0.02; min/max boundaries in UGX & USD).

## 2. Fee-structure versioning
- Add `fee_tier_versions` table: `id`, `version_no`, `organization_id` (null=global), `label`, `notes`, `is_active`, `published_at`, `created_by`.
- Add `version_id uuid` FK on `fee_tiers` (nullable for back-compat; migration backfills v1).
- `calculate_transaction_fee` resolves the active version: tenant-active first, fall back to global-active.
- New `fee_audit_logs.version_id` column populated on every estimate AND charge (audit insert moved into `calculate_transaction_fee` via wrapper `estimate_and_log(_amount,_currency,_org,_context)` invoked from `estimate-fee` and `transfer_funds`).
- UI: `FeeManagement.tsx` gets a Versions tab — list, "Publish new version" (clones active tiers), set active, view audit trail per version.

## 3. Tenant-level overrides
- Already supported by `fee_tiers.organization_id`. Add UI in `FeeManagement.tsx`: org selector → override tiers; "Reset to global" deletes overrides.
- Integration test `src/test/tenant-isolation.test.ts`: seed tenant A (flat 2000 on 50k) and tenant B (flat 500), call `estimate-fee` with each `organization_id`, assert isolation.

## 4. FeeBreakdown wired to payment confirmation
- Mount `<FeeBreakdown amount currency organizationId>` inside `MoMoPaymentDialog.tsx` above the "Pay" button.
- E2E test `src/test/fee-breakdown.e2e.test.tsx` (RTL): renders dialog with mocked `supabase.functions.invoke` returning a known estimate; asserts the rendered fee/total exactly equals the backend estimate object.

## 5. RBAC integration tests
- `src/test/rbac-fees.test.ts` using anon + two seeded users (super_admin, tenant_admin via service-role helper if available, otherwise asserts RLS denial on anon):
  - anon cannot INSERT/UPDATE `fee_tiers` or `exchange_rates` (RLS denies).
  - anon cannot INSERT `fee_tier_versions`.
  - Validates tenant_admin RLS policy strings exist (read-only check via `pg_policies` through `read_query` won't run client-side; use anon negative tests + RLS policy review).
- Tighten existing policies if needed: explicit `INSERT/UPDATE/DELETE` denial for non-super-admin on `fee_tiers`, `exchange_rates`, `fee_tier_versions` (already covered by `ALL` policy gated on `has_role super_admin`, but add a permissive `SELECT` for tenant admins on their own org tiers — already present).

## Technical notes
- Migration order: rounding table → versions table → fee_tiers.version_id → backfill → update `calculate_transaction_fee` → wrapper `estimate_and_log` → audit `version_id` column.
- `estimate-fee` edge function: accept optional `context` ('estimate'|'charge'|'preview') passed to logger; default 'estimate'; only log when caller is authenticated to avoid public test spam (skip log for anon).
- Banker's rounding implemented in SQL via `CASE` on the discarded half-digit + parity of last kept digit; encapsulated in `round_currency`.

## Files
- New migration (rounding, versions, version_id, audit column, function updates).
- Edit `supabase/functions/estimate-fee/index.ts` (context param, auth-aware logging).
- Edit `src/pages/FeeManagement.tsx` (Versions tab, tenant override UI).
- Edit `src/components/MoMoPaymentDialog.tsx` (mount FeeBreakdown).
- New tests: `rounding.test.ts`, `tenant-isolation.test.ts`, `fee-breakdown.e2e.test.tsx`, `rbac-fees.test.ts`.

Approve and I'll execute in this order.