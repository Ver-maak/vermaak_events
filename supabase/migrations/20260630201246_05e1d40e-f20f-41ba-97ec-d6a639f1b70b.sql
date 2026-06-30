CREATE OR REPLACE FUNCTION public.has_password_set(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(
    (SELECT encrypted_password IS NOT NULL AND length(encrypted_password) > 0
     FROM auth.users WHERE id = _user_id),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.has_password_set(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_password_set(uuid) TO service_role;