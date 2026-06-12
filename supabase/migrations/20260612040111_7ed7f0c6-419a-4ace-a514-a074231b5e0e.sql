
-- 1) Table
CREATE TABLE public.event_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  invited_email text,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_admins TO authenticated;
GRANT ALL ON public.event_admins TO service_role;

ALTER TABLE public.event_admins ENABLE ROW LEVEL SECURITY;

-- 2) Helper function
CREATE OR REPLACE FUNCTION public.is_event_admin(_user_id uuid, _event_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.event_admins
    WHERE user_id = _user_id AND event_id = _event_id
  )
$$;

-- 3) Policies on event_admins
CREATE POLICY "Organizers manage event admins"
ON public.event_admins FOR ALL
USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organizer_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organizer_id = auth.uid()));

CREATE POLICY "Super admins manage event admins"
ON public.event_admins FOR ALL
USING (has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Event admins view own grants"
ON public.event_admins FOR SELECT
USING (user_id = auth.uid());

-- 4) Enforce max 4 per event
CREATE OR REPLACE FUNCTION public.enforce_event_admin_limit()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _c int;
BEGIN
  SELECT count(*) INTO _c FROM public.event_admins WHERE event_id = NEW.event_id;
  IF _c >= 4 THEN
    RAISE EXCEPTION 'Maximum of 4 event admins allowed per event';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER event_admin_limit_trigger
BEFORE INSERT ON public.event_admins
FOR EACH ROW EXECUTE FUNCTION public.enforce_event_admin_limit();

-- 5) Extend RLS on events, orders, tickets, ticket_tiers
CREATE POLICY "Event admins view event"
ON public.events FOR SELECT
USING (public.is_event_admin(auth.uid(), id));

CREATE POLICY "Event admins view orders"
ON public.orders FOR SELECT
USING (public.is_event_admin(auth.uid(), event_id));

CREATE POLICY "Event admins view tickets"
ON public.tickets FOR SELECT
USING (public.is_event_admin(auth.uid(), event_id));

CREATE POLICY "Event admins update tickets for check-in"
ON public.tickets FOR UPDATE
USING (public.is_event_admin(auth.uid(), event_id))
WITH CHECK (public.is_event_admin(auth.uid(), event_id));

CREATE POLICY "Event admins view tiers"
ON public.ticket_tiers FOR SELECT
USING (public.is_event_admin(auth.uid(), event_id));

-- 6) Update checkin_ticket to allow event admins
CREATE OR REPLACE FUNCTION public.checkin_ticket(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ticket tickets%ROWTYPE;
  _event events%ROWTYPE;
  _order orders%ROWTYPE;
BEGIN
  SELECT * INTO _ticket FROM tickets WHERE code = _code;
  IF _ticket IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Ticket not found'); END IF;
  SELECT * INTO _event FROM events WHERE id = _ticket.event_id;
  SELECT * INTO _order FROM orders WHERE id = _ticket.order_id;

  IF _event.organizer_id <> auth.uid()
     AND NOT has_role(auth.uid(),'super_admin')
     AND NOT public.is_event_admin(auth.uid(), _event.id) THEN
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
END $function$;

-- 7) Invite / revoke RPCs
CREATE OR REPLACE FUNCTION public.invite_event_admin(_event_id uuid, _email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event events%ROWTYPE;
  _user_id uuid;
  _count int;
BEGIN
  SELECT * INTO _event FROM events WHERE id = _event_id;
  IF _event IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;

  IF _event.organizer_id <> auth.uid() AND NOT has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _email IS NULL OR length(trim(_email)) = 0 THEN
    RAISE EXCEPTION 'Email required';
  END IF;

  SELECT id INTO _user_id FROM profiles WHERE lower(email) = lower(trim(_email)) LIMIT 1;
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'No EventSuite account found for %. Ask them to sign up first, then invite again.', _email;
  END IF;

  IF _user_id = _event.organizer_id THEN
    RAISE EXCEPTION 'This user already owns the event';
  END IF;

  SELECT count(*) INTO _count FROM event_admins WHERE event_id = _event_id;
  IF _count >= 4 THEN
    RAISE EXCEPTION 'Maximum of 4 event admins allowed per event';
  END IF;

  INSERT INTO event_admins (event_id, user_id, invited_email, granted_by)
  VALUES (_event_id, _user_id, lower(trim(_email)), auth.uid())
  ON CONFLICT (event_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'user_id', _user_id);
END $$;

CREATE OR REPLACE FUNCTION public.revoke_event_admin(_event_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _event events%ROWTYPE;
BEGIN
  SELECT * INTO _event FROM events WHERE id = _event_id;
  IF _event IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF _event.organizer_id <> auth.uid() AND NOT has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM event_admins WHERE event_id = _event_id AND user_id = _user_id;
END $$;
