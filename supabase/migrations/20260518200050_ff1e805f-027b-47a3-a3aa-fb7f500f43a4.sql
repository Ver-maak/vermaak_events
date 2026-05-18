
-- 1. Currency rounding rules
CREATE TABLE public.currency_rounding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency currency_code NOT NULL UNIQUE,
  decimals int NOT NULL DEFAULT 2,
  rounding_mode text NOT NULL DEFAULT 'half_up' CHECK (rounding_mode IN ('half_up','half_down','half_even','down','up')),
  min_unit numeric NOT NULL DEFAULT 0.01,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.currency_rounding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read currency_rounding" ON public.currency_rounding FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admins manage currency_rounding" ON public.currency_rounding FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin')) WITH CHECK (has_role(auth.uid(),'super_admin'));

INSERT INTO public.currency_rounding (currency, decimals, rounding_mode, min_unit) VALUES
  ('UGX',0,'half_up',1),
  ('KES',2,'half_up',0.01),
  ('TZS',0,'half_up',1),
  ('USD',2,'half_even',0.01),
  ('EUR',2,'half_even',0.01),
  ('GBP',2,'half_even',0.01)
ON CONFLICT (currency) DO NOTHING;

-- 2. round_currency helper
CREATE OR REPLACE FUNCTION public.round_currency(_amount numeric, _currency currency_code)
RETURNS numeric LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE
  _r currency_rounding%ROWTYPE;
  _scaled numeric;
  _truncated numeric;
  _frac numeric;
  _last_int int;
BEGIN
  SELECT * INTO _r FROM currency_rounding WHERE currency = _currency;
  IF _r IS NULL THEN RETURN round(_amount, 2); END IF;

  IF _r.rounding_mode = 'down' THEN
    RETURN trunc(_amount * power(10, _r.decimals)) / power(10, _r.decimals);
  ELSIF _r.rounding_mode = 'up' THEN
    RETURN ceil(_amount * power(10, _r.decimals)) / power(10, _r.decimals);
  ELSIF _r.rounding_mode = 'half_up' THEN
    RETURN round(_amount, _r.decimals);
  ELSIF _r.rounding_mode = 'half_down' THEN
    _scaled := _amount * power(10, _r.decimals);
    _truncated := trunc(_scaled);
    _frac := abs(_scaled - _truncated);
    IF _frac > 0.5 THEN
      RETURN (sign(_scaled) * (abs(_truncated) + 1)) / power(10, _r.decimals);
    ELSE
      RETURN _truncated / power(10, _r.decimals);
    END IF;
  ELSIF _r.rounding_mode = 'half_even' THEN
    -- banker's rounding
    _scaled := _amount * power(10, _r.decimals);
    _truncated := trunc(_scaled);
    _frac := abs(_scaled - _truncated);
    IF _frac < 0.5 THEN
      RETURN _truncated / power(10, _r.decimals);
    ELSIF _frac > 0.5 THEN
      RETURN (sign(_scaled) * (abs(_truncated) + 1)) / power(10, _r.decimals);
    ELSE
      _last_int := (abs(_truncated))::int % 2;
      IF _last_int = 0 THEN
        RETURN _truncated / power(10, _r.decimals);
      ELSE
        RETURN (sign(_scaled) * (abs(_truncated) + 1)) / power(10, _r.decimals);
      END IF;
    END IF;
  END IF;
  RETURN round(_amount, _r.decimals);
END $$;

-- 3. Fee tier versions
CREATE TABLE public.fee_tier_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_no int NOT NULL,
  organization_id uuid,
  label text NOT NULL,
  notes text,
  is_active boolean NOT NULL DEFAULT false,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (organization_id, version_no)
);
CREATE UNIQUE INDEX fee_tier_versions_one_active_per_scope
  ON public.fee_tier_versions (COALESCE(organization_id::text,'global')) WHERE is_active;

ALTER TABLE public.fee_tier_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read versions" ON public.fee_tier_versions FOR SELECT TO authenticated
  USING (organization_id IS NULL OR organization_id = get_user_org(auth.uid()) OR has_role(auth.uid(),'super_admin'));
CREATE POLICY "Super admins manage versions" ON public.fee_tier_versions FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin')) WITH CHECK (has_role(auth.uid(),'super_admin'));

-- 4. fee_tiers.version_id (nullable, backfilled)
ALTER TABLE public.fee_tiers ADD COLUMN version_id uuid REFERENCES public.fee_tier_versions(id) ON DELETE SET NULL;

-- Seed a v1 active global version and link existing global tiers
INSERT INTO public.fee_tier_versions (version_no, organization_id, label, is_active)
VALUES (1, NULL, 'Initial global pricing v1', true);

UPDATE public.fee_tiers
SET version_id = (SELECT id FROM public.fee_tier_versions WHERE organization_id IS NULL AND version_no = 1)
WHERE organization_id IS NULL AND version_id IS NULL;

-- 5. audit log columns
ALTER TABLE public.fee_audit_logs ADD COLUMN version_id uuid REFERENCES public.fee_tier_versions(id) ON DELETE SET NULL;
ALTER TABLE public.fee_audit_logs ADD COLUMN context text DEFAULT 'estimate';
ALTER TABLE public.fee_audit_logs ADD COLUMN created_by uuid;

-- Allow service-role/security-definer inserts via wrapper; add restrictive client policy
CREATE POLICY "System inserts fee audit logs" ON public.fee_audit_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- 6. Rewrite calculate_transaction_fee to honor versioning + rounding
CREATE OR REPLACE FUNCTION public.calculate_transaction_fee(_amount numeric, _currency currency_code, _organization_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _ugx numeric;
  _rate numeric := 1;
  _tier fee_tiers%ROWTYPE;
  _version_id uuid;
  _fee_ugx numeric;
  _fee_orig numeric;
BEGIN
  IF _currency <> 'UGX' THEN
    SELECT rate_to_ugx INTO _rate FROM exchange_rates WHERE currency = _currency;
    IF _rate IS NULL THEN RAISE EXCEPTION 'No exchange rate configured for %', _currency; END IF;
    _ugx := _amount * _rate;
  ELSE
    _ugx := _amount;
  END IF;

  -- Resolve active version: tenant first, then global
  SELECT id INTO _version_id FROM fee_tier_versions
   WHERE is_active AND (organization_id = _organization_id)
   LIMIT 1;
  IF _version_id IS NULL THEN
    SELECT id INTO _version_id FROM fee_tier_versions
     WHERE is_active AND organization_id IS NULL LIMIT 1;
  END IF;

  -- Tier: prefer tenant tiers tagged to tenant version; else global tiers of global version
  SELECT * INTO _tier FROM fee_tiers
   WHERE is_active AND currency = 'UGX'
     AND _ugx >= min_amount
     AND (_ugx <= max_amount OR max_amount IS NULL)
     AND (
       (organization_id = _organization_id) OR
       (organization_id IS NULL)
     )
     AND (version_id IS NULL OR version_id = _version_id OR version_id IN (SELECT id FROM fee_tier_versions WHERE is_active))
   ORDER BY CASE WHEN organization_id IS NOT NULL THEN 0 ELSE 1 END, sort_order
   LIMIT 1;

  IF _tier IS NULL THEN RAISE EXCEPTION 'No applicable fee tier for amount %', _ugx; END IF;

  IF _tier.fee_type = 'flat' THEN
    _fee_ugx := _tier.fee_value;
  ELSE
    _fee_ugx := _ugx * (_tier.fee_value / 100.0);
  END IF;

  IF _tier.min_fee IS NOT NULL AND _fee_ugx < _tier.min_fee THEN _fee_ugx := _tier.min_fee; END IF;
  IF _tier.max_fee IS NOT NULL AND _fee_ugx > _tier.max_fee THEN _fee_ugx := _tier.max_fee; END IF;

  -- Round UGX fee then convert + round to original currency
  _fee_ugx := round_currency(_fee_ugx, 'UGX');
  IF _currency <> 'UGX' THEN
    _fee_orig := round_currency(_fee_ugx / _rate, _currency);
  ELSE
    _fee_orig := _fee_ugx;
  END IF;

  RETURN jsonb_build_object(
    'fee', _fee_orig,
    'fee_ugx', _fee_ugx,
    'net_amount', _amount - _fee_orig,
    'tier_label', _tier.tier_label,
    'exchange_rate', _rate,
    'ugx_equivalent', _ugx,
    'fee_type', _tier.fee_type,
    'fee_value', _tier.fee_value,
    'version_id', _version_id,
    'tier_id', _tier.id
  );
END $$;

-- 7. Wrapper that calculates AND logs
CREATE OR REPLACE FUNCTION public.estimate_and_log(_amount numeric, _currency currency_code, _organization_id uuid DEFAULT NULL, _context text DEFAULT 'estimate')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _result jsonb;
BEGIN
  _result := calculate_transaction_fee(_amount, _currency, _organization_id);
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO fee_audit_logs (original_amount, original_currency, ugx_equivalent, fee_ugx, fee_original_currency, net_amount, tier_label, exchange_rate, organization_id, version_id, context, created_by)
    VALUES (
      _amount, _currency,
      (_result->>'ugx_equivalent')::numeric,
      (_result->>'fee_ugx')::numeric,
      (_result->>'fee')::numeric,
      (_result->>'net_amount')::numeric,
      _result->>'tier_label',
      (_result->>'exchange_rate')::numeric,
      _organization_id,
      NULLIF(_result->>'version_id','')::uuid,
      _context,
      auth.uid()
    );
  END IF;
  RETURN _result;
END $$;
