
-- Exchange rates table
CREATE TABLE public.exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency currency_code NOT NULL UNIQUE,
  rate_to_ugx numeric NOT NULL,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage exchange rates" ON public.exchange_rates
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Authenticated users view exchange rates" ON public.exchange_rates
  FOR SELECT TO authenticated
  USING (true);

-- Fee tiers table
CREATE TABLE public.fee_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency currency_code NOT NULL DEFAULT 'UGX',
  min_amount numeric NOT NULL DEFAULT 0,
  max_amount numeric, -- NULL means unlimited
  fee_type text NOT NULL CHECK (fee_type IN ('flat', 'percentage')),
  fee_value numeric NOT NULL,
  min_fee numeric,
  max_fee numeric,
  tier_label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fee_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage fee tiers" ON public.fee_tiers
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Tenant admins view applicable tiers" ON public.fee_tiers
  FOR SELECT TO authenticated
  USING (
    organization_id IS NULL
    OR organization_id = get_user_org(auth.uid())
  );

-- Fee audit logs
CREATE TABLE public.fee_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES public.transactions(id),
  original_amount numeric NOT NULL,
  original_currency currency_code NOT NULL,
  ugx_equivalent numeric NOT NULL,
  fee_ugx numeric NOT NULL,
  fee_original_currency numeric NOT NULL,
  net_amount numeric NOT NULL,
  tier_label text NOT NULL,
  exchange_rate numeric,
  organization_id uuid REFERENCES public.organizations(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fee_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins view all fee logs" ON public.fee_audit_logs
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Tenant admins view org fee logs" ON public.fee_audit_logs
  FOR SELECT TO authenticated
  USING (organization_id = get_user_org(auth.uid()) AND has_role(auth.uid(), 'tenant_admin'));

-- Calculate fee function
CREATE OR REPLACE FUNCTION public.calculate_transaction_fee(
  _amount numeric,
  _currency currency_code,
  _organization_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _ugx_amount numeric;
  _rate numeric := 1;
  _tier fee_tiers%ROWTYPE;
  _fee_ugx numeric;
  _fee_original numeric;
  _net numeric;
BEGIN
  -- Convert to UGX if needed
  IF _currency != 'UGX' THEN
    SELECT rate_to_ugx INTO _rate FROM exchange_rates WHERE currency = _currency;
    IF _rate IS NULL THEN
      RAISE EXCEPTION 'No exchange rate configured for %', _currency;
    END IF;
    _ugx_amount := _amount * _rate;
  ELSE
    _ugx_amount := _amount;
  END IF;

  -- Find applicable tier (org-specific first, then global)
  SELECT * INTO _tier FROM fee_tiers
  WHERE is_active = true
    AND currency = 'UGX'
    AND _ugx_amount >= min_amount
    AND (_ugx_amount <= max_amount OR max_amount IS NULL)
    AND (organization_id = _organization_id OR organization_id IS NULL)
  ORDER BY
    CASE WHEN organization_id IS NOT NULL THEN 0 ELSE 1 END,
    sort_order
  LIMIT 1;

  IF _tier IS NULL THEN
    RAISE EXCEPTION 'No applicable fee tier for amount %', _ugx_amount;
  END IF;

  -- Calculate fee
  IF _tier.fee_type = 'flat' THEN
    _fee_ugx := _tier.fee_value;
  ELSE
    _fee_ugx := _ugx_amount * (_tier.fee_value / 100.0);
  END IF;

  -- Apply min/max constraints
  IF _tier.min_fee IS NOT NULL AND _fee_ugx < _tier.min_fee THEN
    _fee_ugx := _tier.min_fee;
  END IF;
  IF _tier.max_fee IS NOT NULL AND _fee_ugx > _tier.max_fee THEN
    _fee_ugx := _tier.max_fee;
  END IF;

  -- Convert fee back to original currency
  IF _currency != 'UGX' THEN
    _fee_original := ROUND(_fee_ugx / _rate, 2);
  ELSE
    _fee_original := _fee_ugx;
  END IF;

  _net := _amount - _fee_original;

  RETURN jsonb_build_object(
    'fee', _fee_original,
    'fee_ugx', _fee_ugx,
    'net_amount', _net,
    'tier_label', _tier.tier_label,
    'exchange_rate', _rate,
    'ugx_equivalent', _ugx_amount,
    'fee_type', _tier.fee_type,
    'fee_value', _tier.fee_value
  );
END;
$$;

-- Update transfer_funds to include fees
CREATE OR REPLACE FUNCTION public.transfer_funds(
  _from_wallet_id uuid,
  _to_wallet_id uuid,
  _amount numeric,
  _description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _from_wallet wallets%ROWTYPE;
  _to_wallet wallets%ROWTYPE;
  _tx_id UUID;
  _fee_result jsonb;
  _fee numeric;
  _total_debit numeric;
BEGIN
  SELECT * INTO _from_wallet FROM wallets WHERE id = _from_wallet_id FOR UPDATE;
  SELECT * INTO _to_wallet FROM wallets WHERE id = _to_wallet_id FOR UPDATE;

  IF _from_wallet IS NULL OR _to_wallet IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;
  IF _from_wallet.currency != _to_wallet.currency THEN
    RAISE EXCEPTION 'Currency mismatch';
  END IF;
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  -- Calculate fee
  _fee_result := calculate_transaction_fee(_amount, _from_wallet.currency, _from_wallet.organization_id);
  _fee := (_fee_result->>'fee')::numeric;
  _total_debit := _amount + _fee;

  IF _from_wallet.balance < _total_debit THEN
    RAISE EXCEPTION 'Insufficient funds (amount + fee = %)', _total_debit;
  END IF;

  -- Debit sender (amount + fee)
  UPDATE wallets SET balance = balance - _total_debit, updated_at = now() WHERE id = _from_wallet_id;
  -- Credit receiver (amount only)
  UPDATE wallets SET balance = balance + _amount, updated_at = now() WHERE id = _to_wallet_id;

  -- Record transfer transaction
  INSERT INTO transactions (organization_id, from_wallet_id, to_wallet_id, type, amount, currency, status, description, reference)
  VALUES (_from_wallet.organization_id, _from_wallet_id, _to_wallet_id, 'transfer', _amount, _from_wallet.currency, 'completed', _description, 'TXN-' || substr(gen_random_uuid()::text, 1, 8))
  RETURNING id INTO _tx_id;

  -- Record fee transaction
  IF _fee > 0 THEN
    INSERT INTO transactions (organization_id, from_wallet_id, type, amount, currency, status, description, reference)
    VALUES (_from_wallet.organization_id, _from_wallet_id, 'fee', _fee, _from_wallet.currency, 'completed', 'Transfer fee for TXN-' || substr(_tx_id::text, 1, 8), 'FEE-' || substr(gen_random_uuid()::text, 1, 8));

    -- Audit log
    INSERT INTO fee_audit_logs (transaction_id, original_amount, original_currency, ugx_equivalent, fee_ugx, fee_original_currency, net_amount, tier_label, exchange_rate, organization_id)
    VALUES (_tx_id, _amount, _from_wallet.currency, (_fee_result->>'ugx_equivalent')::numeric, (_fee_result->>'fee_ugx')::numeric, _fee, (_fee_result->>'net_amount')::numeric, _fee_result->>'tier_label', (_fee_result->>'exchange_rate')::numeric, _from_wallet.organization_id);
  END IF;

  RETURN _tx_id;
END;
$$;

-- Seed default exchange rates
INSERT INTO public.exchange_rates (currency, rate_to_ugx) VALUES
  ('UGX', 1),
  ('USD', 3750),
  ('EUR', 4000),
  ('GBP', 4850),
  ('KES', 30),
  ('TZS', 1.7),
  ('RWF', 3.8);

-- Seed default UGX fee tiers
INSERT INTO public.fee_tiers (currency, min_amount, max_amount, fee_type, fee_value, min_fee, max_fee, tier_label, sort_order) VALUES
  ('UGX', 0, 60000, 'flat', 500, NULL, NULL, 'UGX 0 – 60,000 (Flat UGX 500)', 1),
  ('UGX', 60001, 200000, 'flat', 1000, NULL, NULL, 'UGX 60,001 – 200,000 (Flat UGX 1,000)', 2),
  ('UGX', 200001, 1000000, 'percentage', 0.6, 1500, 6000, 'UGX 200,001 – 1,000,000 (0.6%)', 3),
  ('UGX', 1000001, 5000000, 'percentage', 0.5, 6000, 20000, 'UGX 1,000,001 – 5,000,000 (0.5%)', 4),
  ('UGX', 5000001, 20000000, 'percentage', 0.4, 20000, 60000, 'UGX 5,000,001 – 20,000,000 (0.4%)', 5),
  ('UGX', 20000001, NULL, 'percentage', 0.3, NULL, 150000, 'UGX 20,000,001+ (0.3%, cap 150K)', 6);

-- Enable realtime for exchange_rates so admin updates propagate
ALTER PUBLICATION supabase_realtime ADD TABLE public.exchange_rates;
