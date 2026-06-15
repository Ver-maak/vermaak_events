
-- 1. create_ticket_order_v2: do NOT increment sold on pending order creation.
--    Only check capacity against currently-paid sold count.
CREATE OR REPLACE FUNCTION public.create_ticket_order_v2(_event_id uuid, _buyer_name text, _buyer_email text, _buyer_phone text, _items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _order_id UUID;
  _event events%ROWTYPE;
  _item JSONB;
  _tier ticket_tiers%ROWTYPE;
  _holders JSONB;
  _h JSONB;
  _qty INT;
  _total NUMERIC := 0;
BEGIN
  SELECT * INTO _event FROM events WHERE id = _event_id;
  IF _event IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF _event.status <> 'published' THEN RAISE EXCEPTION 'Event not on sale'; END IF;

  INSERT INTO orders (event_id, buyer_id, buyer_name, buyer_email, buyer_phone, currency, status)
  VALUES (_event_id, auth.uid(), _buyer_name, _buyer_email, _buyer_phone, _event.currency, 'pending')
  RETURNING id INTO _order_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT * INTO _tier FROM ticket_tiers WHERE id = (_item->>'tier_id')::uuid FOR UPDATE;
    IF _tier IS NULL OR _tier.event_id <> _event_id THEN RAISE EXCEPTION 'Invalid tier'; END IF;

    _holders := COALESCE(_item->'holders', '[]'::jsonb);
    _qty := jsonb_array_length(_holders);
    IF _qty < 1 THEN CONTINUE; END IF;

    IF _tier.quantity IS NOT NULL AND _tier.sold + _qty > _tier.quantity THEN
      RAISE EXCEPTION 'Not enough tickets in tier %', _tier.name;
    END IF;

    -- NOTE: sold is no longer incremented here. It is updated when payment is confirmed.
    _total := _total + (_tier.price * _qty);

    FOR _h IN SELECT * FROM jsonb_array_elements(_holders) LOOP
      INSERT INTO tickets (order_id, event_id, tier_id, holder_name, holder_email, metadata)
      VALUES (
        _order_id, _event_id, _tier.id,
        COALESCE(NULLIF(_h->>'name',''), _buyer_name),
        COALESCE(NULLIF(_h->>'email',''), _buyer_email),
        COALESCE(_h - 'name' - 'email', '{}'::jsonb)
      );
    END LOOP;
  END LOOP;

  UPDATE orders SET total_amount = _total WHERE id = _order_id;
  IF _total = 0 THEN
    -- Free order: mark as paid immediately AND bump sold counts.
    UPDATE orders SET status='paid', paid_at=now(), payment_method='free' WHERE id=_order_id;
    UPDATE ticket_tiers tt
       SET sold = sold + sub.qty
      FROM (SELECT tier_id, count(*)::int AS qty FROM tickets WHERE order_id = _order_id GROUP BY tier_id) sub
     WHERE tt.id = sub.tier_id;
  END IF;
  RETURN _order_id;
END $function$;

-- 2. Legacy create_ticket_order: same treatment.
CREATE OR REPLACE FUNCTION public.create_ticket_order(_event_id uuid, _buyer_name text, _buyer_email text, _buyer_phone text, _items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _order_id UUID;
  _event events%ROWTYPE;
  _item JSONB;
  _tier ticket_tiers%ROWTYPE;
  _qty INT;
  _total NUMERIC := 0;
  _i INT;
  _holder TEXT;
BEGIN
  SELECT * INTO _event FROM events WHERE id = _event_id;
  IF _event IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF _event.status <> 'published' THEN RAISE EXCEPTION 'Event not on sale'; END IF;

  INSERT INTO orders (event_id, buyer_id, buyer_name, buyer_email, buyer_phone, currency, status)
  VALUES (_event_id, auth.uid(), _buyer_name, _buyer_email, _buyer_phone, _event.currency, 'pending')
  RETURNING id INTO _order_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT * INTO _tier FROM ticket_tiers WHERE id = (_item->>'tier_id')::uuid FOR UPDATE;
    IF _tier IS NULL OR _tier.event_id <> _event_id THEN RAISE EXCEPTION 'Invalid tier'; END IF;
    _qty := COALESCE((_item->>'quantity')::int, 1);
    _holder := COALESCE(_item->>'holder_name', _buyer_name);
    IF _qty < 1 THEN CONTINUE; END IF;
    IF _tier.quantity IS NOT NULL AND _tier.sold + _qty > _tier.quantity THEN
      RAISE EXCEPTION 'Not enough tickets in tier %', _tier.name;
    END IF;

    _total := _total + (_tier.price * _qty);

    FOR _i IN 1.._qty LOOP
      INSERT INTO tickets (order_id, event_id, tier_id, holder_name, holder_email)
      VALUES (_order_id, _event_id, _tier.id, _holder, _buyer_email);
    END LOOP;
  END LOOP;

  UPDATE orders SET total_amount = _total WHERE id = _order_id;

  IF _total = 0 THEN
    UPDATE orders SET status = 'paid', paid_at = now(), payment_method = 'free' WHERE id = _order_id;
    UPDATE ticket_tiers tt
       SET sold = sold + sub.qty
      FROM (SELECT tier_id, count(*)::int AS qty FROM tickets WHERE order_id = _order_id GROUP BY tier_id) sub
     WHERE tt.id = sub.tier_id;
  END IF;

  RETURN _order_id;
END $function$;

-- 3. mark_order_paid: bump sold when the order transitions from pending → paid.
CREATE OR REPLACE FUNCTION public.mark_order_paid(_order_id uuid, _method text, _reference text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _order orders%ROWTYPE; _updated int;
BEGIN
  SELECT * INTO _order FROM orders WHERE id = _order_id;
  IF _order IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF _order.buyer_id <> auth.uid() AND NOT has_role(auth.uid(),'super_admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE orders SET status='paid', paid_at=now(), payment_method=_method, payment_reference=_reference
  WHERE id = _order_id AND status = 'pending';
  GET DIAGNOSTICS _updated = ROW_COUNT;
  IF _updated > 0 THEN
    UPDATE ticket_tiers tt
       SET sold = sold + sub.qty
      FROM (SELECT tier_id, count(*)::int AS qty FROM tickets WHERE order_id = _order_id GROUP BY tier_id) sub
     WHERE tt.id = sub.tier_id;
  END IF;
END $function$;

-- 4. mark_order_paid_by_reference: bump sold on success, no-op on failure
--    (since we no longer reserve on pending).
CREATE OR REPLACE FUNCTION public.mark_order_paid_by_reference(_provider_ref text, _status text, _raw jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _intent payment_intents%ROWTYPE;
  _order orders%ROWTYPE;
  _updated int;
BEGIN
  SELECT * INTO _intent FROM payment_intents WHERE provider_ref = _provider_ref;
  IF _intent IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'intent_not_found');
  END IF;

  UPDATE payment_intents
    SET status = _status, raw = COALESCE(_raw,'{}'::jsonb), updated_at = now()
    WHERE id = _intent.id;

  IF _status = 'success' THEN
    UPDATE orders
      SET status = 'paid', paid_at = COALESCE(paid_at, now()),
          payment_method = _intent.provider, payment_reference = _intent.provider_ref
      WHERE id = _intent.order_id AND status = 'pending';
    GET DIAGNOSTICS _updated = ROW_COUNT;
    IF _updated > 0 THEN
      UPDATE ticket_tiers tt
         SET sold = sold + sub.qty
        FROM (SELECT tier_id, count(*)::int AS qty FROM tickets WHERE order_id = _intent.order_id GROUP BY tier_id) sub
       WHERE tt.id = sub.tier_id;
    END IF;
  ELSIF _status IN ('failed','cancelled') THEN
    UPDATE orders SET status = 'cancelled' WHERE id = _intent.order_id AND status = 'pending';
    -- No sold decrement needed: pending orders never incremented sold.
  END IF;

  SELECT * INTO _order FROM orders WHERE id = _intent.order_id;
  RETURN jsonb_build_object('ok', true, 'order_id', _order.id, 'order_status', _order.status, 'event_id', _order.event_id);
END $function$;

-- 5. Backfill every tier's sold to match actual paid tickets.
UPDATE ticket_tiers tt
   SET sold = COALESCE(p.qty, 0)
  FROM (
    SELECT tk.tier_id, count(*)::int AS qty
      FROM tickets tk
      JOIN orders o ON o.id = tk.order_id
     WHERE o.status = 'paid'
     GROUP BY tk.tier_id
  ) p
 WHERE tt.id = p.tier_id;

UPDATE ticket_tiers
   SET sold = 0
 WHERE id NOT IN (
   SELECT tk.tier_id FROM tickets tk JOIN orders o ON o.id = tk.order_id WHERE o.status = 'paid'
 );
