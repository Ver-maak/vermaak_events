
CREATE OR REPLACE FUNCTION public.save_payment_provider(_code text, _name text, _enabled boolean, _mode text, _base_url text, _callback_url text, _redirect_success_url text, _redirect_cancel_url text, _credentials jsonb, _preview jsonb, _enc_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
         THEN extensions.pgp_sym_encrypt(_credentials::text, _enc_key) ELSE NULL END,
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
END $function$;

CREATE OR REPLACE FUNCTION public.get_payment_provider_decrypted(_code text, _enc_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE _row payment_providers%ROWTYPE; _creds jsonb;
BEGIN
  SELECT * INTO _row FROM payment_providers WHERE code = _code;
  IF _row IS NULL THEN RETURN NULL; END IF;
  IF _row.credentials_encrypted IS NULL THEN
    _creds := '{}'::jsonb;
  ELSE
    _creds := extensions.pgp_sym_decrypt(_row.credentials_encrypted, _enc_key)::jsonb;
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
END $function$;
