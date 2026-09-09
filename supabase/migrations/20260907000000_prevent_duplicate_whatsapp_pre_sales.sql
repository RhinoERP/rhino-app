-- Una conversación sólo puede originar una preventa. La restricción protege
-- contra confirmaciones repetidas y workers que procesen el mismo trabajo tras
-- recuperar un bloqueo vencido.
CREATE UNIQUE INDEX IF NOT EXISTS sales_orders_whatsapp_conversation_unique
  ON public.sales_orders (conversation_id)
  WHERE source = 'WHATSAPP' AND conversation_id IS NOT NULL;
