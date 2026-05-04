
-- Extend role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'organizer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'attendee';

-- Event status enum
DO $$ BEGIN
  CREATE TYPE public.event_status AS ENUM ('draft','published','cancelled','completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM ('pending','paid','cancelled','refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- EVENTS
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  venue TEXT,
  city TEXT,
  category TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  status public.event_status NOT NULL DEFAULT 'draft',
  currency TEXT NOT NULL DEFAULT 'UGX',
  capacity INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_organizer ON public.events(organizer_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status);
CREATE INDEX IF NOT EXISTS idx_events_starts_at ON public.events(starts_at);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view published events" ON public.events
  FOR SELECT TO anon, authenticated
  USING (status = 'published');

CREATE POLICY "Organizers manage own events" ON public.events
  FOR ALL TO authenticated
  USING (organizer_id = auth.uid())
  WITH CHECK (organizer_id = auth.uid());

CREATE POLICY "Super admins manage all events" ON public.events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- TICKET TIERS
CREATE TABLE IF NOT EXISTS public.ticket_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'UGX',
  quantity INTEGER,
  sold INTEGER NOT NULL DEFAULT 0,
  sales_start TIMESTAMPTZ,
  sales_end TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tiers_event ON public.ticket_tiers(event_id);

ALTER TABLE public.ticket_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view tiers of published events" ON public.ticket_tiers
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.status = 'published'));

CREATE POLICY "Organizers manage own tiers" ON public.ticket_tiers
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organizer_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organizer_id = auth.uid()));

CREATE POLICY "Super admins manage all tiers" ON public.ticket_tiers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- ORDERS
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  buyer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  buyer_email TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  buyer_phone TEXT,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'UGX',
  status public.order_status NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  payment_reference TEXT,
  reference TEXT NOT NULL DEFAULT ('ORD-' || substr(gen_random_uuid()::text,1,8)),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_event ON public.orders(event_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON public.orders(buyer_id);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers view own orders" ON public.orders
  FOR SELECT TO authenticated
  USING (buyer_id = auth.uid());

CREATE POLICY "Buyers create orders" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (buyer_id = auth.uid());

CREATE POLICY "Buyers update own pending orders" ON public.orders
  FOR UPDATE TO authenticated
  USING (buyer_id = auth.uid());

CREATE POLICY "Organizers view event orders" ON public.orders
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organizer_id = auth.uid()));

CREATE POLICY "Super admins view all orders" ON public.orders
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- TICKETS
CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  tier_id UUID REFERENCES public.ticket_tiers(id) ON DELETE SET NULL,
  code TEXT NOT NULL UNIQUE DEFAULT ('TKT-' || upper(substr(gen_random_uuid()::text,1,12))),
  holder_name TEXT NOT NULL,
  holder_email TEXT,
  checked_in_at TIMESTAMPTZ,
  checked_in_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tickets_order ON public.tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_tickets_event ON public.tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_code ON public.tickets(code);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers view own tickets" ON public.tickets
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.buyer_id = auth.uid()));

CREATE POLICY "Organizers view & update event tickets" ON public.tickets
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organizer_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organizer_id = auth.uid()));

CREATE POLICY "Super admins manage tickets" ON public.tickets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_events_updated ON public.events;
CREATE TRIGGER trg_events_updated BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_tiers_updated ON public.ticket_tiers;
CREATE TRIGGER trg_tiers_updated BEFORE UPDATE ON public.ticket_tiers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated ON public.orders;
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Atomic checkout: create order + tickets, increment tier sold counts
CREATE OR REPLACE FUNCTION public.create_ticket_order(
  _event_id UUID,
  _buyer_name TEXT,
  _buyer_email TEXT,
  _buyer_phone TEXT,
  _items JSONB  -- [{tier_id, quantity, holder_name}]
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

    UPDATE ticket_tiers SET sold = sold + _qty WHERE id = _tier.id;
    _total := _total + (_tier.price * _qty);

    FOR _i IN 1.._qty LOOP
      INSERT INTO tickets (order_id, event_id, tier_id, holder_name, holder_email)
      VALUES (_order_id, _event_id, _tier.id, _holder, _buyer_email);
    END LOOP;
  END LOOP;

  UPDATE orders SET total_amount = _total WHERE id = _order_id;

  -- Auto-mark free orders as paid
  IF _total = 0 THEN
    UPDATE orders SET status = 'paid', paid_at = now(), payment_method = 'free' WHERE id = _order_id;
  END IF;

  RETURN _order_id;
END $$;

-- Mark order paid (stub for payment confirmation)
CREATE OR REPLACE FUNCTION public.mark_order_paid(_order_id UUID, _method TEXT, _reference TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _order orders%ROWTYPE;
BEGIN
  SELECT * INTO _order FROM orders WHERE id = _order_id;
  IF _order IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF _order.buyer_id <> auth.uid() AND NOT has_role(auth.uid(),'super_admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE orders SET status='paid', paid_at=now(), payment_method=_method, payment_reference=_reference
  WHERE id = _order_id AND status = 'pending';
END $$;

-- Check in a ticket by code
CREATE OR REPLACE FUNCTION public.checkin_ticket(_code TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _ticket tickets%ROWTYPE;
  _event events%ROWTYPE;
  _order orders%ROWTYPE;
BEGIN
  SELECT * INTO _ticket FROM tickets WHERE code = _code;
  IF _ticket IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Ticket not found'); END IF;
  SELECT * INTO _event FROM events WHERE id = _ticket.event_id;
  SELECT * INTO _order FROM orders WHERE id = _ticket.order_id;

  IF _event.organizer_id <> auth.uid() AND NOT has_role(auth.uid(),'super_admin') THEN
    RETURN jsonb_build_object('ok',false,'error','Not authorized');
  END IF;
  IF _order.status <> 'paid' THEN
    RETURN jsonb_build_object('ok',false,'error','Order not paid');
  END IF;
  IF _ticket.checked_in_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'error','Already checked in','at',_ticket.checked_in_at,'holder',_ticket.holder_name);
  END IF;

  UPDATE tickets SET checked_in_at = now(), checked_in_by = auth.uid() WHERE id = _ticket.id;
  RETURN jsonb_build_object('ok',true,'holder',_ticket.holder_name,'event',_event.title);
END $$;
