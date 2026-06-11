CREATE OR REPLACE FUNCTION public.save_payment_provider(_code text, _name text, _enabled boolean, _mode text, _base_url text, _callback_url text, _redirect_success_url text, _redirect_cancel_url text, _credentials jsonb, _preview jsonb, _enc_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _id uuid;
  _existing jsonb := '{}'::jsonb;
  _existing_enc bytea;
  _merged jsonb;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _enc_key IS NULL OR length(_enc_key) < 16 THEN
    RAISE EXCEPTION 'Encryption key missing';
  END IF;

  -- Load existing encrypted credentials so we can MERGE rather than overwrite.
  -- Without this, saving just one field (e.g. wallet_address) wipes the others.
  SELECT credentials_encrypted INTO _existing_enc FROM payment_providers WHERE code = _code;
  IF _existing_enc IS NOT NULL THEN
    BEGIN
      _existing := extensions.pgp_sym_decrypt(_existing_enc, _enc_key)::jsonb;
    EXCEPTION WHEN others THEN
      _existing := '{}'::jsonb;
    END;
  END IF;

  _merged := _existing || COALESCE(_credentials, '{}'::jsonb);

  INSERT INTO payment_providers (
    code, name, enabled, mode, base_url, callback_url,
    redirect_success_url, redirect_cancel_url,
    credentials_encrypted, credentials_preview, updated_by
  ) VALUES (
    _code, _name, COALESCE(_enabled,false), COALESCE(_mode,'sandbox'),
    _base_url, _callback_url, _redirect_success_url, _redirect_cancel_url,
    CASE WHEN _merged <> '{}'::jsonb
         THEN extensions.pgp_sym_encrypt(_merged::text, _enc_key) ELSE NULL END,
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
      credentials_encrypted = CASE WHEN _merged <> '{}'::jsonb
                                   THEN extensions.pgp_sym_encrypt(_merged::text, _enc_key)
                                   ELSE payment_providers.credentials_encrypted END,
      credentials_preview = CASE WHEN _preview IS NOT NULL AND _preview <> '{}'::jsonb
                                 THEN _preview ELSE payment_providers.credentials_preview END,
      updated_by = auth.uid(),
      updated_at = now()
  RETURNING id INTO _id;
  RETURN _id;
END $function$;