CREATE OR REPLACE FUNCTION public.handle_order_paid_ticket_generation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.generate_tickets_for_paid_order(NEW.id);
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'paid' AND NEW.status <> 'paid' THEN
    INSERT INTO public.order_ticket_holds (order_id, event_id, tier_id, holder_name, holder_email, metadata, source_ticket_id, created_at)
    SELECT t.order_id, t.event_id, t.tier_id, t.holder_name, t.holder_email, t.metadata, t.id, t.created_at
    FROM public.tickets t
    WHERE t.order_id = NEW.id
    ON CONFLICT (source_ticket_id) DO NOTHING;

    DELETE FROM public.tickets WHERE order_id = NEW.id;
    PERFORM public.sync_event_paid_ticket_counts(NEW.event_id);
  END IF;
  RETURN NEW;
END;
$function$;