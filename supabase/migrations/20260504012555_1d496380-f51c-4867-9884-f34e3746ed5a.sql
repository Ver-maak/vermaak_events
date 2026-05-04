
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

REVOKE EXECUTE ON FUNCTION public.create_ticket_order(UUID, TEXT, TEXT, TEXT, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_order_paid(UUID, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.checkin_ticket(TEXT) FROM anon;
