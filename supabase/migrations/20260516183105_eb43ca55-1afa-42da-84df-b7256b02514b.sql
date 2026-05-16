
-- Rotaract member directory (D9213)
CREATE TABLE public.rotaract_members (
  member_id TEXT PRIMARY KEY,
  district_id TEXT NOT NULL DEFAULT '9213',
  club_name TEXT,
  club_type TEXT,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  member_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rotaract_members_email ON public.rotaract_members (lower(email));
CREATE INDEX idx_rotaract_members_name ON public.rotaract_members (lower(full_name));

ALTER TABLE public.rotaract_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage rotaract members"
ON public.rotaract_members FOR ALL TO authenticated
USING (has_role(auth.uid(),'super_admin'))
WITH CHECK (has_role(auth.uid(),'super_admin'));

-- Public lookup via security-definer RPC (returns limited fields)
CREATE OR REPLACE FUNCTION public.lookup_rotaract_member(_query TEXT)
RETURNS TABLE(member_id TEXT, full_name TEXT, club_name TEXT, club_type TEXT, email TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT m.member_id, m.full_name, m.club_name, m.club_type, m.email
  FROM public.rotaract_members m
  WHERE _query IS NOT NULL AND length(trim(_query)) >= 2 AND (
    lower(m.email) = lower(trim(_query))
    OR lower(m.full_name) LIKE '%' || lower(trim(_query)) || '%'
    OR m.member_id = trim(_query)
  )
  ORDER BY (lower(m.email) = lower(trim(_query))) DESC, m.full_name
  LIMIT 10;
$$;
GRANT EXECUTE ON FUNCTION public.lookup_rotaract_member(TEXT) TO anon, authenticated;

-- Attendee metadata on tickets
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- New order RPC supporting per-ticket holders + metadata
CREATE OR REPLACE FUNCTION public.create_ticket_order_v2(
  _event_id UUID, _buyer_name TEXT, _buyer_email TEXT, _buyer_phone TEXT, _items JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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

    UPDATE ticket_tiers SET sold = sold + _qty WHERE id = _tier.id;
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
    UPDATE orders SET status='paid', paid_at=now(), payment_method='free' WHERE id=_order_id;
  END IF;
  RETURN _order_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_ticket_order_v2(UUID,TEXT,TEXT,TEXT,JSONB) TO authenticated;
