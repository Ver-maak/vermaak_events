-- =====================================================
-- payment_intents
-- =====================================================
CREATE TABLE public.payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('mtn_momo','airtel_money')),
  provider_ref TEXT NOT NULL UNIQUE,
  phone TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'UGX',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed','cancelled')),
  raw JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payment_intents_order ON public.payment_intents(order_id);

ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers view own payment intents" ON public.payment_intents
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = payment_intents.order_id AND o.buyer_id = auth.uid()));

CREATE POLICY "Organizers view event payment intents" ON public.payment_intents
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM orders o JOIN events e ON e.id = o.event_id
  WHERE o.id = payment_intents.order_id AND e.organizer_id = auth.uid()
));

CREATE POLICY "Super admins manage payment intents" ON public.payment_intents
FOR ALL TO authenticated
USING (has_role(auth.uid(),'super_admin')) WITH CHECK (has_role(auth.uid(),'super_admin'));

CREATE POLICY "Buyers create own payment intents" ON public.payment_intents
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND o.buyer_id = auth.uid()));

CREATE TRIGGER trg_payment_intents_updated BEFORE UPDATE ON public.payment_intents
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================
-- api_keys
-- =====================================================
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,        -- e.g. esk_live_AbCd
  key_hash TEXT NOT NULL UNIQUE, -- sha256 hex
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_keys_organizer ON public.api_keys(organizer_id);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizers manage own api keys" ON public.api_keys
FOR ALL TO authenticated
USING (organizer_id = auth.uid()) WITH CHECK (organizer_id = auth.uid());

CREATE POLICY "Super admins view api keys" ON public.api_keys
FOR SELECT TO authenticated
USING (has_role(auth.uid(),'super_admin'));

-- =====================================================
-- webhook_endpoints
-- =====================================================
CREATE TABLE public.webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT ARRAY['order.paid','ticket.checked_in']::TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhook_endpoints_org ON public.webhook_endpoints(organizer_id);

ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizers manage own endpoints" ON public.webhook_endpoints
FOR ALL TO authenticated
USING (organizer_id = auth.uid()) WITH CHECK (organizer_id = auth.uid());

CREATE POLICY "Super admins view endpoints" ON public.webhook_endpoints
FOR SELECT TO authenticated
USING (has_role(auth.uid(),'super_admin'));

CREATE TRIGGER trg_webhook_endpoints_updated BEFORE UPDATE ON public.webhook_endpoints
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================
-- webhook_deliveries
-- =====================================================
CREATE TABLE public.webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed')),
  attempts INT NOT NULL DEFAULT 0,
  response_status INT,
  last_error TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhook_deliveries_endpoint ON public.webhook_deliveries(endpoint_id, created_at DESC);

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizers view own deliveries" ON public.webhook_deliveries
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM webhook_endpoints w WHERE w.id = webhook_deliveries.endpoint_id AND w.organizer_id = auth.uid()));

CREATE POLICY "Super admins view all deliveries" ON public.webhook_deliveries
FOR SELECT TO authenticated
USING (has_role(auth.uid(),'super_admin'));

-- =====================================================
-- Functions
-- =====================================================

-- Mark order paid using payment intent reference (called by webhook with service role)
CREATE OR REPLACE FUNCTION public.mark_order_paid_by_reference(_provider_ref TEXT, _status TEXT, _raw JSONB)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
END $$;

-- Verify API key by hash, returns organizer_id if active
CREATE OR REPLACE FUNCTION public.verify_api_key_hash(_hash TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _org UUID;
BEGIN
  SELECT organizer_id INTO _org FROM api_keys
   WHERE key_hash = _hash AND revoked_at IS NULL;
  IF _org IS NOT NULL THEN
    UPDATE api_keys SET last_used_at = now() WHERE key_hash = _hash;
  END IF;
  RETURN _org;
END $$;
