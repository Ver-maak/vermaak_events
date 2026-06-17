CREATE TABLE IF NOT EXISTS public.order_ticket_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  tier_id uuid REFERENCES public.ticket_tiers(id) ON DELETE SET NULL,
  holder_name text NOT NULL,
  holder_email text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_ticket_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.order_ticket_holds TO authenticated;
GRANT ALL ON public.order_ticket_holds TO service_role;

ALTER TABLE public.order_ticket_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Buyers and event managers can view ticket holds" ON public.order_ticket_holds;
CREATE POLICY "Buyers and event managers can view ticket holds"
ON public.order_ticket_holds
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.events e ON e.id = o.event_id
    WHERE o.id = order_ticket_holds.order_id
      AND (
        o.buyer_id = auth.uid()
        OR e.organizer_id = auth.uid()
        OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
        OR public.is_event_admin(auth.uid(), e.id)
      )
  )
);

CREATE INDEX IF NOT EXISTS idx_order_ticket_holds_order_id ON public.order_ticket_holds(order_id);
CREATE INDEX IF NOT EXISTS idx_order_ticket_holds_event_id ON public.order_ticket_holds(event_id);

CREATE OR REPLACE FUNCTION public.sync_event_paid_ticket_counts(_event_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.ticket_tiers tt
     SET sold = (
       SELECT count(*)::int
       FROM public.tickets tk
       JOIN public.orders o ON o.id = tk.order_id
       WHERE tk.tier_id = tt.id
         AND o.status = 'paid'
     )
   WHERE tt.event_id = _event_id;
$function$;

CREATE OR REPLACE FUNCTION public.generate_tickets_for_paid_order(_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _order public.orders%ROWTYPE;
  _inserted int := 0;
  _existing int := 0;
BEGIN
  SELECT * INTO _order FROM public.orders WHERE id = _order_id;
  IF _order IS NULL OR _order.status <> 'paid' THEN
    RETURN 0;
  END IF;

  SELECT count(*)::int INTO _existing FROM public.tickets WHERE order_id = _order_id;
  IF _existing > 0 THEN
    PERFORM public.sync_event_paid_ticket_counts(_order.event_id);
    RETURN _existing;
  END IF;

  INSERT INTO public.tickets (order_id, event_id, tier_id, holder_name, holder_email, metadata)
  SELECT h.order_id, h.event_id, h.tier_id, h.holder_name, h.holder_email, h.metadata
  FROM public.order_ticket_holds h
  WHERE h.order_id = _order_id
  ORDER BY h.created_at, h.id;

  GET DIAGNOSTICS _inserted = ROW_COUNT;
  PERFORM public.sync_event_paid_ticket_counts(_order.event_id);
  RETURN _inserted;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_order_paid_ticket_generation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.generate_tickets_for_paid_order(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_order_paid_ticket_generation ON public.orders;
CREATE TRIGGER trg_order_paid_ticket_generation
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_order_paid_ticket_generation();

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

    _total := _total + (_tier.price * _qty);

    FOR _h IN SELECT * FROM jsonb_array_elements(_holders) LOOP
      INSERT INTO order_ticket_holds (order_id, event_id, tier_id, holder_name, holder_email, metadata)
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
    UPDATE orders SET status='paid', paid_at=now(), payment_method='free' WHERE id=_order_id;
  END IF;
  RETURN _order_id;
END;
$function$;

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
  _i INT;
  _total NUMERIC := 0;
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
      INSERT INTO order_ticket_holds (order_id, event_id, tier_id, holder_name, holder_email, metadata)
      VALUES (_order_id, _event_id, _tier.id, _holder, _buyer_email, '{}'::jsonb);
    END LOOP;
  END LOOP;

  UPDATE orders SET total_amount = _total WHERE id = _order_id;

  IF _total = 0 THEN
    UPDATE orders SET status = 'paid', paid_at = now(), payment_method = 'free' WHERE id = _order_id;
  END IF;

  RETURN _order_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_order_paid(_order_id uuid, _method text, _reference text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _order orders%ROWTYPE;
BEGIN
  SELECT * INTO _order FROM orders WHERE id = _order_id;
  IF _order IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF _order.buyer_id <> auth.uid() AND NOT has_role(auth.uid(),'super_admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE orders SET status='paid', paid_at=now(), payment_method=_method, payment_reference=_reference
  WHERE id = _order_id AND status = 'pending';
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_order_paid_by_reference(_provider_ref text, _status text, _raw jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _intent payment_intents%ROWTYPE;
  _order orders%ROWTYPE;
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
  ELSIF _status IN ('failed','cancelled') THEN
    UPDATE orders SET status = 'cancelled' WHERE id = _intent.order_id AND status = 'pending';
  END IF;

  SELECT * INTO _order FROM orders WHERE id = _intent.order_id;
  RETURN jsonb_build_object('ok', true, 'order_id', _order.id, 'order_status', _order.status, 'event_id', _order.event_id);
END;
$function$;