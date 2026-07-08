-- 010_informal_entry_terminal_states.sql
-- Extiende los estados terminales y orígenes permitidos de asientos informales.

ALTER TABLE accounting.informal_entries
  DROP CONSTRAINT IF EXISTS informal_entries_source_type_check;

ALTER TABLE accounting.informal_entries
  ADD CONSTRAINT informal_entries_source_type_check
  CHECK (
    source_type IN (
      'NOTA_DE_VENTA',
      'FACTURA_PENDIENTE',
      'COMPRA',
      'NOTA_DE_CREDITO'
    )
  );

ALTER TABLE accounting.informal_entries
  DROP CONSTRAINT IF EXISTS informal_entries_estado_formalizacion_check;

ALTER TABLE accounting.informal_entries
  ADD CONSTRAINT informal_entries_estado_formalizacion_check
  CHECK (
    estado_formalizacion IN (
      'PENDIENTE',
      'FORMALIZADO',
      'CANCELADO',
      'ASENTADO'
    )
  );