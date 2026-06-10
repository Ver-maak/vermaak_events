DO $$
DECLARE _eid uuid := '043b3a95-040b-4d18-b102-574b592f3032';
BEGIN
  DELETE FROM payment_intents WHERE order_id IN (SELECT id FROM orders WHERE event_id = _eid);
  DELETE FROM tickets WHERE event_id = _eid;
  DELETE FROM orders WHERE event_id = _eid;
  DELETE FROM ticket_tiers WHERE event_id = _eid;
  DELETE FROM events WHERE id = _eid;
END $$;