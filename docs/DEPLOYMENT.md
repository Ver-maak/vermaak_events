# Deployment Guide — EnventSuite Payments

This guide covers the production deployment of the EnventSuite payment integration
across Netlify (frontend) and Lovable Cloud / Supabase (backend + edge functions).

The architecture is **provider-agnostic**: only `supabase/functions/_shared/payments.ts`
needs to change when adding a new gateway. Today only **Swarmbyte** is wired in.

---

## 1. Domains & environment configuration

The platform is hosted at `https://vervent.netlify.app` today and will migrate to
`https://events.vermaak.app` later. Domain values are **never hard-coded** —
they're sourced from environment configuration:

| Where | What | Notes |
| --- | --- | --- |
| Netlify → Site settings → Environment | `VITE_PUBLIC_SITE_URL` | Used by the frontend to build absolute URLs |
| Cloud (Supabase) → Authentication → URL Config | Site URL + Redirect URLs | Add both `https://vervent.netlify.app` and `https://events.vermaak.app` |
| Edge Functions environment | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYMENT_CREDS_KEY` | Already managed by Cloud — do not duplicate |
| Payment Settings (admin UI) | `callback_url`, `redirect_success_url`, `redirect_cancel_url` | Stored per-provider in `payment_providers` — update once at migration |

When you migrate `vervent.netlify.app → events.vermaak.app`:

1. Add the new domain in Netlify and point DNS.
2. Add `https://events.vermaak.app` to Supabase Auth → URL config.
3. Update the three callback URLs on **Admin → Payment Settings → Swarmbyte**.
4. Update the webhook URL inside Swarmbyte's merchant dashboard.

No code changes are required.

---

## 2. CORS

`supabase/functions/_shared/payments.ts` allows `*` so both the current and
future origins work without redeploying. If you need to lock CORS down later,
replace `Access-Control-Allow-Origin: *` with a comma-separated list of
allowed origins matched against `Origin` at runtime.

---

## 3. Required Edge Function secrets

Set these in **Cloud → Settings → Edge Function Secrets** (most are already there):

| Secret | Source | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | Auto | Self URL for callbacks |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto | Service-role client for RPCs |
| `SUPABASE_ANON_KEY` | Auto | JWT verification |
| `PAYMENT_CREDS_KEY` | You (rotate quarterly) | AES key used by `pgp_sym_encrypt` to store provider credentials in `payment_providers.credentials_encrypted` |

**Swarmbyte credentials are NOT stored as Edge Function secrets.** They live
encrypted in the `payment_providers` table and are edited from **Admin →
Payment Settings**:

| Field in Payment Settings | Swarmbyte name |
| --- | --- |
| `api_key` | `client_id` (from "Programmatic Access" → API Credentials) |
| `api_secret` | `client_secret` |
| `wallet_address` | Collection wallet address (e.g. `WAL-XXXXXXXX`) |
| `base_url` | `https://core.swarmbyte.com` (sandbox & live share the host) |
| `mode` | `sandbox` or `live` |
| `callback_url` | `https://<project>.functions.supabase.co/payments-webhook?provider=swarmbyte` — **paste this exact URL into the Swarmbyte dashboard's Webhook URL field too** |

---

## 4. Swarmbyte IP allowlist (mandatory in live mode)

Swarmbyte enforces a **programmatic access allowlist**. Without it, `/v1/collect`
returns `403 Forbidden — caller IP not allowed` regardless of valid credentials.

Supabase Edge Functions run on Deno Deploy, which uses a **regional pool of egress
IPs**, not a single static IP. There are three deployment options, listed in
order of preference:

### Option A — Allow the Deno Deploy egress range (recommended)

1. Open **Cloud → Settings → Project info** and copy the project ref
   (e.g. `jxdtnefqihvnkkksbgzh`).
2. Identify your project's region (visible in the same panel; typically `eu-central-1`).
3. Open <https://docs.deno.com/deploy/manual/regions> and copy the published
   IP ranges for that region. Supabase publishes the current Deno-Deploy outbound
   ranges in the trust center; if absent, file a support ticket asking for
   "Deno Deploy egress IPs for region X".
4. In the Swarmbyte dashboard → **Programmatic Access → IP Allowlist**,
   paste each CIDR range and save.

### Option B — Pin egress through a proxy with a static IP (most reliable)

If Swarmbyte rejects CIDR ranges and only accepts /32 entries:

1. Provision a small VM (DigitalOcean / Hetzner / AWS NAT) with a fixed public IP.
2. Run a forward proxy (Cloudflare Tunnel, HAProxy, or a simple Node proxy).
3. Allowlist that single IP in Swarmbyte.
4. Set a new Edge Function secret `SWARMBYTE_PROXY_URL` and update
   `swarmbyteToken()` / `initiate()` in `_shared/payments.ts` to route through it.

A reference is left as a TODO comment in the adapter; un-comment when needed.

### Option C — Self-host the function on a known-IP runner (last resort)

Move `payments-initiate` and `payments-webhook` to a small Fly.io or Render
service with a static IP. Update the frontend invocation URL accordingly.

> **Action required at go-live:** confirm which option you'll use with the
> Swarmbyte support team and capture the approved IP list in a runbook entry.

---

## 5. Webhook URL configuration

Inside the Swarmbyte merchant dashboard:

```
Webhook URL: https://<project-ref>.functions.supabase.co/payments-webhook?provider=swarmbyte
HTTP Method: POST
Retries:     enabled (Swarmbyte retries on non-2xx for ~24h with backoff)
```

Notes:

- Swarmbyte webhooks are **unsigned by design** (per their docs). Security relies on
  HTTPS, the unguessable function path, and the idempotency layer below.
- Duplicate deliveries are deduped via `processed_webhook_events`
  (`UNIQUE(provider, event_key)`) and acknowledged with HTTP 200 so Swarmbyte
  stops retrying.
- Edge function is deployed automatically — no manual step.

---

## 6. Database

The migrations in `supabase/migrations/` are applied automatically by Cloud.
Key payments tables:

- `payment_providers` — encrypted credentials per provider
- `payment_intents` — one row per buyer attempt (idempotency key)
- `processed_webhook_events` — dedupe ledger
- `payment_logs` — request/response audit trail

If you ever rotate `PAYMENT_CREDS_KEY`, re-save each provider's credentials
from Admin → Payment Settings so they re-encrypt with the new key.

---

## 7. Netlify deployment

```
Build command: npm run build
Publish dir:   dist
Node version:  20
```

Required environment variables:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>
VITE_PUBLIC_SITE_URL=https://events.vermaak.app   # update at migration
```

Both `VITE_SUPABASE_*` values are mirrored from Lovable Cloud and rarely change.

---

## 8. Post-deploy verification

After every deploy:

```bash
# 1. Sanity check the public site
curl -I https://events.vermaak.app

# 2. Confirm the webhook endpoint is reachable
curl -X POST 'https://<project-ref>.functions.supabase.co/payments-webhook?provider=swarmbyte' \
  -H 'Content-Type: application/json' \
  -d '{"transactionId":"healthcheck","status":"pending"}'
# Expected: {"ok":true} or {"error":"missing provider reference"}
```

Then go through one real sandbox purchase end-to-end and confirm:

- `payment_intents` row transitions `pending → success`
- `orders.status` flips to `paid`
- `tickets` rows render in the buyer's dashboard
- `payment_logs` has matching outbound + inbound entries

---

## 9. Operational runbook

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `403 Forbidden` on `/v1/collect` | IP not allowlisted in Swarmbyte | See §4 |
| `401 Unauthorized` from Swarmbyte | Token expired or wrong credentials | Re-save credentials in Payment Settings, then click "Test connection" |
| Buyer charged but no ticket | Webhook missed | Buyer can hit "Check status" in the dialog — it calls `payments-verify` which reconciles via `GET /v1/collect/transactions/:id` |
| Duplicate ticket worry | Won't happen — `processed_webhook_events` + `mark_order_paid_by_reference` both idempotent | n/a |
