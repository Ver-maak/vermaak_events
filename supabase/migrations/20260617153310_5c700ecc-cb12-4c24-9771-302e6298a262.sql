REVOKE EXECUTE ON FUNCTION public.create_ticket_order(uuid, text, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_ticket_order_v2(uuid, text, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_order_paid(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_order_paid_by_reference(text, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_tickets_for_paid_order(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_event_paid_ticket_counts(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_order_paid_ticket_generation() FROM anon, authenticated;