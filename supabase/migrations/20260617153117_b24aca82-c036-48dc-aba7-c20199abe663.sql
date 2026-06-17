INSERT INTO public.order_ticket_holds (order_id, event_id, tier_id, holder_name, holder_email, metadata, source_ticket_id, created_at)
SELECT t.order_id, t.event_id, t.tier_id, t.holder_name, t.holder_email, t.metadata, t.id, t.created_at
FROM public.tickets t
ON CONFLICT (source_ticket_id) DO NOTHING;

DELETE FROM public.tickets t
USING public.orders o
WHERE o.id = t.order_id
  AND o.status <> 'paid';

UPDATE public.ticket_tiers tt
   SET sold = (
     SELECT count(*)::int
     FROM public.tickets tk
     JOIN public.orders o ON o.id = tk.order_id
     WHERE tk.tier_id = tt.id
       AND o.status = 'paid'
   );