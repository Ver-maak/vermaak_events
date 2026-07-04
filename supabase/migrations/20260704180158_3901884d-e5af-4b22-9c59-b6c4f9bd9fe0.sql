
CREATE OR REPLACE FUNCTION public.platform_event_fees_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _past_fee numeric := 0;
  _up_fee numeric := 0;
  _past_events int := 0;
  _up_events int := 0;
  _rec record;
  _fee jsonb;
  _cur currency_code;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR _rec IN
    SELECT o.total_amount, o.currency, e.organization_id,
           (e.starts_at < now()) AS is_past
    FROM orders o
    JOIN events e ON e.id = o.event_id
    WHERE o.status = 'paid' AND COALESCE(o.total_amount, 0) > 0
  LOOP
    BEGIN
      _cur := _rec.currency::currency_code;
    EXCEPTION WHEN others THEN
      _cur := 'UGX'::currency_code;
    END;
    BEGIN
      _fee := calculate_transaction_fee(_rec.total_amount, _cur, _rec.organization_id);
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
    IF _rec.is_past THEN
      _past_fee := _past_fee + COALESCE((_fee->>'fee_ugx')::numeric, 0);
    ELSE
      _up_fee := _up_fee + COALESCE((_fee->>'fee_ugx')::numeric, 0);
    END IF;
  END LOOP;

  SELECT count(DISTINCT e.id) INTO _past_events
  FROM events e JOIN orders o ON o.event_id = e.id
  WHERE o.status = 'paid' AND e.starts_at < now();

  SELECT count(DISTINCT e.id) INTO _up_events
  FROM events e JOIN orders o ON o.event_id = e.id
  WHERE o.status = 'paid' AND e.starts_at >= now();

  RETURN jsonb_build_object(
    'past_fee_ugx', _past_fee,
    'upcoming_fee_ugx', _up_fee,
    'past_event_count', _past_events,
    'upcoming_event_count', _up_events
  );
END $$;

GRANT EXECUTE ON FUNCTION public.platform_event_fees_summary() TO authenticated;
