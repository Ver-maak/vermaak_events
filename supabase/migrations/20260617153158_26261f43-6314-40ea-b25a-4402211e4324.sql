REVOKE EXECUTE ON FUNCTION public.create_ticket_order(uuid, text, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_ticket_order_v2(uuid, text, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_order_paid(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_order_paid_by_reference(text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_tickets_for_paid_order(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_event_paid_ticket_counts(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_order_paid_ticket_generation() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_ticket_order(uuid, text, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_ticket_order_v2(uuid, text, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_order_paid(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_order_paid_by_reference(text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_tickets_for_paid_order(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_event_paid_ticket_counts(uuid) TO service_role;