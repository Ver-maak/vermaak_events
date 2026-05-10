
CREATE OR REPLACE FUNCTION public.quote_event_fee(_event_id uuid, _amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event events%ROWTYPE;
  _fee jsonb;
  _currency currency_code;
BEGIN
  SELECT * INTO _event FROM events WHERE id = _event_id;
  IF _event IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF _amount IS NULL OR _amount < 0 THEN _amount := 0; END IF;

  IF _amount = 0 THEN
    RETURN jsonb_build_object(
      'subtotal', 0, 'fee', 0, 'grand_total', 0,
      'currency', _event.currency, 'tier_label', 'No fee (free)',
      'fee_type', 'flat', 'fee_value', 0
    );
  END IF;

  BEGIN
    _currency := _event.currency::currency_code;
  EXCEPTION WHEN others THEN
    _currency := 'UGX'::currency_code;
  END;

  _fee := calculate_transaction_fee(_amount, _currency, _event.organization_id);

  RETURN jsonb_build_object(
    'subtotal', _amount,
    'fee', (_fee->>'fee')::numeric,
    'grand_total', _amount + (_fee->>'fee')::numeric,
    'currency', _event.currency,
    'tier_label', _fee->>'tier_label',
    'fee_type', _fee->>'fee_type',
    'fee_value', (_fee->>'fee_value')::numeric
  );
END $$;

GRANT EXECUTE ON FUNCTION public.quote_event_fee(uuid, numeric) TO authenticated, anon;
