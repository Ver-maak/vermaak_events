
CREATE TABLE public.short_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  target_url text NOT NULL,
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  click_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX short_links_event_id_idx ON public.short_links(event_id);
CREATE INDEX short_links_created_by_idx ON public.short_links(created_by);

GRANT SELECT ON public.short_links TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.short_links TO authenticated;
GRANT ALL ON public.short_links TO service_role;

ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read short links" ON public.short_links
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create short links" ON public.short_links
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Owners or super admins can update" ON public.short_links
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Owners or super admins can delete" ON public.short_links
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE OR REPLACE FUNCTION public.increment_short_link_click(_slug text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.short_links SET click_count = click_count + 1 WHERE slug = _slug;
$$;

GRANT EXECUTE ON FUNCTION public.increment_short_link_click(text) TO anon, authenticated;
