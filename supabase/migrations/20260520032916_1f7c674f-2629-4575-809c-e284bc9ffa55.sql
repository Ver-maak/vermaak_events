CREATE OR REPLACE FUNCTION public.lookup_rotaract_member(_query text)
 RETURNS TABLE(member_id text, full_name text, club_name text, club_type text, email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.member_id, m.full_name, m.club_name, m.club_type, m.email
  FROM public.rotaract_members m
  WHERE _query IS NOT NULL AND length(trim(_query)) >= 2 AND (
    lower(m.full_name) = lower(trim(_query))
    OR lower(m.email) = lower(trim(_query))
    OR lower(m.full_name) LIKE '%' || lower(trim(_query)) || '%'
    OR m.member_id = trim(_query)
  )
  ORDER BY
    (lower(m.full_name) = lower(trim(_query))) DESC,
    (lower(m.email) = lower(trim(_query))) DESC,
    m.full_name
  LIMIT 50;
$function$;