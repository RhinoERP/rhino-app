-- A settlement reverses the fiscal advance with its own credit note. This is
-- distinct from a return or a manual adjustment and must be accepted by the
-- persisted origin-type constraint.
ALTER TABLE public.credit_notes
  DROP CONSTRAINT IF EXISTS credit_notes_origin_type_check;

ALTER TABLE public.credit_notes
  ADD CONSTRAINT credit_notes_origin_type_check
  CHECK (
    origin_type IN (
      'RETURN',
      'PURCHASE_TARGET',
      'ADVANCE_SETTLEMENT',
      'MANUAL_ADJUSTMENT',
      'OTHER'
    )
  );
