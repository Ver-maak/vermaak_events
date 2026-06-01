
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Payment providers (credentials stored encrypted)
CREATE TABLE public.payment_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,            -- e.g. 'swarmbyte'
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'sandbox', -- 'sandbox' | 'live'
  base_url text,
  callback_url text,
  redirect_success_url text,
  redirect_cancel_url text,
  credentials_encrypted bytea,          -- pgp_sym_encrypt(jsonb::text, key)
  credentials_preview jsonb NOT NULL DEFAULT '{}'::jsonb, -- masked previews shown to UI
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_providers TO authenticated;
GRANT ALL ON public.payment_providers TO service_role;

ALTER TABLE public.payment_providers ENABLE ROW LEVEL SECURITY;

-- Super admins manage everything; UI never selects credentials_encrypted directly
CREATE POLICY "Super admins manage payment providers"
ON public.payment_providers FOR ALL TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER payment_providers_touch
BEFORE UPDATE ON public.payment_providers
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Audit log for provider calls + webhooks
CREATE TABLE public.payment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code text NOT NULL,
  direction text NOT NULL,              -- 'outbound' | 'inbound'
  endpoint text,
  status_code int,
  request jsonb,
  response jsonb,
  order_id uuid,
  intent_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.payment_logs TO authenticated;
GRANT ALL ON public.payment_logs TO service_role;

ALTER TABLE public.payment_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins view payment logs"
ON public.payment_logs FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Service role inserts payment logs"
ON public.payment_logs FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX payment_logs_provider_idx ON public.payment_logs(provider_code, created_at DESC);

-- Save/update provider credentials with server-side encryption.
-- Caller must be super_admin. _credentials is a JSON object of secret fields.
-- _preview is a JSON object of masked values safe to display in UI.
CREATE OR REPLACE FUNCTION public.save_payment_provider(
  _code text,
  _name text,
  _enabled boolean,
  _mode text,
  _base_url text,
  _callback_url text,
  _redirect_success_url text,
  _redirect_cancel_url text,
  _credentials jsonb,
  _preview jsonb,
  _enc_key text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _enc_key IS NULL OR length(_enc_key) < 16 THEN
    RAISE EXCEPTION 'Encryption key missing';
  END IF;

  INSERT INTO payment_providers (
    code, name, enabled, mode, base_url, callback_url,
    redirect_success_url, redirect_cancel_url,
    credentials_encrypted, credentials_preview, updated_by
  ) VALUES (
    _code, _name, COALESCE(_enabled,false), COALESCE(_mode,'sandbox'),
    _base_url, _callback_url, _redirect_success_url, _redirect_cancel_url,
    CASE WHEN _credentials IS NOT NULL AND _credentials <> '{}'::jsonb
         THEN pgp_sym_encrypt(_credentials::text, _enc_key) ELSE NULL END,
    COALESCE(_preview, '{}'::jsonb), auth.uid()
  )
  ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      enabled = EXCLUDED.enabled,
      mode = EXCLUDED.mode,
      base_url = EXCLUDED.base_url,
      callback_url = EXCLUDED.callback_url,
      redirect_success_url = EXCLUDED.redirect_success_url,
      redirect_cancel_url = EXCLUDED.redirect_cancel_url,
      credentials_encrypted = COALESCE(EXCLUDED.credentials_encrypted, payment_providers.credentials_encrypted),
      credentials_preview = CASE WHEN _preview IS NOT NULL AND _preview <> '{}'::jsonb
                                 THEN _preview ELSE payment_providers.credentials_preview END,
      updated_by = auth.uid(),
      updated_at = now()
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- Decrypt credentials for server-side use (service role / edge functions).
-- NOT exposed via RLS; the edge function uses SECURITY DEFINER + the env key.
CREATE OR REPLACE FUNCTION public.get_payment_provider_decrypted(_code text, _enc_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row payment_providers%ROWTYPE; _creds jsonb;
BEGIN
  SELECT * INTO _row FROM payment_providers WHERE code = _code;
  IF _row IS NULL THEN RETURN NULL; END IF;
  IF _row.credentials_encrypted IS NULL THEN
    _creds := '{}'::jsonb;
  ELSE
    _creds := pgp_sym_decrypt(_row.credentials_encrypted, _enc_key)::jsonb;
  END IF;
  RETURN jsonb_build_object(
    'code', _row.code,
    'enabled', _row.enabled,
    'mode', _row.mode,
    'base_url', _row.base_url,
    'callback_url', _row.callback_url,
    'redirect_success_url', _row.redirect_success_url,
    'redirect_cancel_url', _row.redirect_cancel_url,
    'credentials', _creds
  );
END $$;

REVOKE ALL ON FUNCTION public.get_payment_provider_decrypted(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_provider_decrypted(text, text) TO service_role;
