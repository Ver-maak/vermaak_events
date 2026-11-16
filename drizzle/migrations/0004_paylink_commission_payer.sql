ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS commission_payer text NOT NULL DEFAULT 'payer';
ALTER TABLE public.payment_links ADD CONSTRAINT payment_links_commission_payer_check CHECK (commission_payer IN ('payer','payee'));
COMMENT ON COLUMN public.payment_links.commission_payer IS 'Who bears the service fee: payer = added on top of amount; payee = deducted from amount received.';