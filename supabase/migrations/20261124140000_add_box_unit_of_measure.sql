-- Add the commercial box unit used by the optional box-and-unit inventory flow.
-- Application behavior remains gated by organization settings.
ALTER TYPE public.unit_of_measure_type
  ADD VALUE IF NOT EXISTS 'CAJA';
