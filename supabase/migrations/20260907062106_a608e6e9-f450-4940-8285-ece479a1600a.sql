CREATE TABLE public.payment_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  currency text NOT NULL DEFAULT 'UGX',
  amount_mode text NOT NULL DEFAULT 'fixed',
  unit_amount numeric NOT NULL DEFAULT 0,
  min_amount numeric,
  max_amount numeric,
  note_label text,
  note_required boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_links_amount_mode_check CHECK (amount_mode IN ('fixed','quantity','open'))
);

CREATE TABLE public.payment_link_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  link_id uuid NOT NULL REFERENCES public.payment_links(id) ON DELETE CASCADE,
  reference text NOT NULL UNIQUE,
  payer_name text NOT NULL,
  payer_email text NOT NULL,
  payer_phone text,
  note text,
  quantity integer NOT NULL DEFAULT 1,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'UGX',
  status text NOT NULL DEFAULT 'pending',
  provider text,
  provider_ref text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_link_payments_status_check CHECK (status IN ('pending','paid','failed','cancelled'))
);

CREATE INDEX idx_plp_link ON public.payment_link_payments(link_id);
CREATE INDEX idx_plp_provider_ref ON public.payment_link_payments(provider_ref);

GRANT SELECT ON public.payment_links TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_links TO authenticated;
GRANT ALL ON public.payment_links TO service_role;

GRANT SELECT ON public.payment_link_payments TO authenticated;
GRANT ALL ON public.payment_link_payments TO service_role;

ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_link_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active payment links are publicly viewable"
  ON public.payment_links FOR SELECT
  USING (is_active = true);

CREATE POLICY "Owners and super admins can view their links"
  ON public.payment_links FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Organizers can create payment links"
  ON public.payment_links FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (public.has_role(auth.uid(), 'organizer') OR public.has_role(auth.uid(), 'super_admin'))
  );

CREATE POLICY "Owners and super admins can update links"
  ON public.payment_links FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Owners and super admins can delete links"
  ON public.payment_links FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Owners and super admins can view link payments"
  ON public.payment_link_payments FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR EXISTS (
      SELECT 1 FROM public.payment_links pl
      WHERE pl.id = payment_link_payments.link_id AND pl.created_by = auth.uid()
    )
  );

CREATE TRIGGER trg_payment_links_updated BEFORE UPDATE ON public.payment_links
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_plp_updated BEFORE UPDATE ON public.payment_link_payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();