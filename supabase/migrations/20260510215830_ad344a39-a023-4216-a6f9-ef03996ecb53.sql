
CREATE OR REPLACE FUNCTION public.quote_order_fee(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order orders%ROWTYPE;
  _event events%ROWTYPE;
  _fee jsonb;
  _currency currency_code;
BEGIN
  SELECT * INTO _order FROM orders WHERE id = _order_id;
  IF _order IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;

  SELECT * INTO _event FROM events WHERE id = _order.event_id;

  -- Authorization: buyer, event organizer, or super admin
  IF _order.buyer_id <> auth.uid()
     AND COALESCE(_event.organizer_id, '00000000-0000-0000-0000-000000000000'::uuid) <> auth.uid()
     AND NOT has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Cast text currency to enum; default to UGX if unknown
  BEGIN
    _currency := _order.currency::currency_code;
  EXCEPTION WHEN others THEN
    _currency := 'UGX'::currency_code;
  END;

  _fee := calculate_transaction_fee(
    _order.total_amount,
    _currency,
    _event.organization_id
  );

  RETURN jsonb_build_object(
    'subtotal', _order.total_amount,
    'fee', (_fee->>'fee')::numeric,
    'grand_total', _order.total_amount + (_fee->>'fee')::numeric,
    'currency', _order.currency,
    'tier_label', _fee->>'tier_label',
    'fee_type', _fee->>'fee_type',
    'fee_value', (_fee->>'fee_value')::numeric
  );
END $$;

GRANT EXECUTE ON FUNCTION public.quote_order_fee(uuid) TO authenticated;
