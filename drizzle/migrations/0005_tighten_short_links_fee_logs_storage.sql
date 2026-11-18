DROP POLICY IF EXISTS "Anyone can read short links" ON public.short_links;
CREATE POLICY "Owners or super admins can read short links" ON public.short_links
  FOR SELECT TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE OR REPLACE FUNCTION public.resolve_short_link(_slug text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT target_url FROM public.short_links WHERE slug = _slug LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.get_event_short_link(_event_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT slug FROM public.short_links WHERE event_id = _event_id ORDER BY created_at ASC LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.resolve_short_link(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_short_link(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "System inserts fee audit logs" ON public.fee_audit_logs;

DROP POLICY IF EXISTS "Paylink logos public read" ON storage.objects;
DROP POLICY IF EXISTS "Event covers are publicly readable" ON storage.objects;
CREATE POLICY "Owners read own event covers" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'event-covers' AND (storage.foldername(name))[1] = (select auth.uid()::text));