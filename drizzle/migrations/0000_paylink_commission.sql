ALTER TABLE public.payment_links
  ADD COLUMN IF NOT EXISTS commission_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_flat numeric NOT NULL DEFAULT 0;

ALTER TABLE public.payment_link_payments
  ADD COLUMN IF NOT EXISTS base_amount numeric,
  ADD COLUMN IF NOT EXISTS commission_amount numeric NOT NULL DEFAULT 0;

UPDATE public.payment_link_payments SET base_amount = amount WHERE base_amount IS NULL;