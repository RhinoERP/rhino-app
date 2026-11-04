-- IA Comercial · alcance del asistente por WhatsApp.
-- Por defecto cada celular ve solo la cartera de su usuario (sus clientes, sus
-- ventas, su meta), aunque el usuario sea gerente. Con team_view un gerente
-- puede consultar toda la empresa por WhatsApp. Para un vendedor no cambia nada.
-- Se puede correr más de una vez sin error.

ALTER TABLE public.commercial_ai_seller_phones
  ADD COLUMN IF NOT EXISTS team_view boolean NOT NULL DEFAULT false;
