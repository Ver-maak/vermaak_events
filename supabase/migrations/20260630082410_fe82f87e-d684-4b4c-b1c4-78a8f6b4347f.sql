GRANT EXECUTE ON FUNCTION public.create_ticket_order_v2(uuid, text, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_ticket_order(uuid, text, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_order_paid(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.quote_event_fee(uuid, numeric) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.quote_order_fee(uuid) TO authenticated, service_role;