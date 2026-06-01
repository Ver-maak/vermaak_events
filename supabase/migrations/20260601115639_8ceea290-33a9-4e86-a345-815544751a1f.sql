
-- Allow swarmbyte as a payment intent provider
ALTER TABLE public.payment_intents DROP CONSTRAINT IF EXISTS payment_intents_provider_check;
ALTER TABLE public.payment_intents
  ADD CONSTRAINT payment_intents_provider_check
  CHECK (provider = ANY (ARRAY['mtn_momo','airtel_money','swarmbyte']));

-- Webhook idempotency table
CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_key)
);

GRANT SELECT, INSERT ON public.processed_webhook_events TO authenticated;
GRANT ALL ON public.processed_webhook_events TO service_role;

ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admins read webhook dedup"
  ON public.processed_webhook_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));
