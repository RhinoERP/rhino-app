-- Nueva definición de objetivos. No reinterpretar las antiguas palancas
-- monetarias: facturación emitida, cantidades y visitas son métricas distintas.
ALTER TABLE public.seller_progress_goals
  ADD COLUMN IF NOT EXISTS metric_targets jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.seller_progress_goals.metric_targets IS
  'Metas independientes: billing (ARS), units, kg, lt, boxes, meters, newCustomers, visits y sales.';
