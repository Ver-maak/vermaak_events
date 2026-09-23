ALTER TABLE public.payment_links ALTER COLUMN commission_percent SET DEFAULT 3.5;
UPDATE public.payment_links SET commission_percent = 3.5 WHERE commission_percent = 0;