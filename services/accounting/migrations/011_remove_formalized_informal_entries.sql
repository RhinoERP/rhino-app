-- 011_remove_formalized_informal_entries.sql
-- FORMALIZADO deja de ser un estado visible/persistente de asientos informales.
-- Los asientos ya formalizados viven en accounting.journal_entries.

SET search_path TO accounting, public;

ALTER TABLE accounting.informal_entries
  DROP CONSTRAINT IF EXISTS informal_entries_estado_formalizacion_check;

DELETE FROM accounting.informal_entries
WHERE estado_formalizacion = 'FORMALIZADO';

ALTER TABLE accounting.informal_entries
  ADD CONSTRAINT informal_entries_estado_formalizacion_check
  CHECK (
    estado_formalizacion IN (
      'PENDIENTE',
      'CANCELADO',
      'ASENTADO'
    )
  );

ALTER TABLE accounting.informal_entries
  DROP CONSTRAINT IF EXISTS informal_entries_source_type_check;

ALTER TABLE accounting.informal_entries
  ADD CONSTRAINT informal_entries_source_type_check
  CHECK (
    source_type IN (
      'NOTA_DE_VENTA',
      'FACTURA_PENDIENTE',
      'COMPRA',
      'NOTA_DE_CREDITO',
      'COBRO',
      'ORDEN_PAGO'
    )
  );
