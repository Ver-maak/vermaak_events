
-- Allow pending event admin invites for users who don't have an account yet
ALTER TABLE public.event_admins ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.event_admins DROP CONSTRAINT IF EXISTS event_admins_event_id_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS event_admins_event_user_uniq
  ON public.event_admins (event_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS event_admins_event_pending_email_uniq
  ON public.event_admins (event_id, lower(invited_email)) WHERE user_id IS NULL;

-- Updated invite function: accept invites for emails without an account yet
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
  _clean text := lower(trim(_email));
BEGIN
  SELECT * INTO _event FROM events WHERE id = _event_id;
  IF _event IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;

  IF _event.organizer_id <> auth.uid() AND NOT has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _clean IS NULL OR length(_clean) = 0 OR _clean !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'Valid email required';
  END IF;

  SELECT count(*) INTO _count FROM event_admins WHERE event_id = _event_id;
  IF _count >= 4 THEN
    RAISE EXCEPTION 'Maximum of 4 event admins allowed per event';
  END IF;

  SELECT id INTO _user_id FROM profiles WHERE lower(email) = _clean LIMIT 1;

  IF _user_id IS NOT NULL THEN
    IF _user_id = _event.organizer_id THEN
      RAISE EXCEPTION 'This user already owns the event';
    END IF;
    INSERT INTO event_admins (event_id, user_id, invited_email, granted_by)
    VALUES (_event_id, _user_id, _clean, auth.uid())
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('ok', true, 'status', 'linked', 'user_id', _user_id);
  ELSE
    INSERT INTO event_admins (event_id, user_id, invited_email, granted_by)
    VALUES (_event_id, NULL, _clean, auth.uid())
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('ok', true, 'status', 'pending', 'email', _clean);
  END IF;
END $$;

-- Revoke by row id (handles pending rows where user_id is null)
CREATE OR REPLACE FUNCTION public.revoke_event_admin_row(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _row event_admins%ROWTYPE; _event events%ROWTYPE;
BEGIN
  SELECT * INTO _row FROM event_admins WHERE id = _id;
  IF _row IS NULL THEN RETURN; END IF;
  SELECT * INTO _event FROM events WHERE id = _row.event_id;
  IF _event.organizer_id <> auth.uid() AND NOT has_role(auth.uid(),'super_admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM event_admins WHERE id = _id;
END $$;

-- Link pending invites when a new profile is created
CREATE OR REPLACE FUNCTION public.link_pending_event_admin_invites()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    UPDATE public.event_admins
       SET user_id = NEW.id
     WHERE user_id IS NULL
       AND lower(invited_email) = lower(NEW.email);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS link_pending_event_admin_invites_trg ON public.profiles;
CREATE TRIGGER link_pending_event_admin_invites_trg
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.link_pending_event_admin_invites();
