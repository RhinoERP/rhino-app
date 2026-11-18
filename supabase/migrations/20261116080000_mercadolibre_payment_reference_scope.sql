-- One Mercado Pago operation identifies one active collection for one sale.
-- Voided loads remain auditable and may be replaced by a corrected load.
BEGIN;

-- Prevent a registration/void from racing the duplicate check and index change.
LOCK TABLE public.mercadolibre_payments IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.mercadolibre_payments
    WHERE status = 'RECORDED'
    GROUP BY organization_id, lower(reference_number)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = 'Hay IDs de operación Mercado Pago repetidos entre cobros vigentes de la misma organización',
      HINT = 'Revisar las cargas y anular solamente los registros erróneos antes de aplicar esta migración. No se modificaron cobros.';
  END IF;
END;
$$;

DROP INDEX public.mercadolibre_payments_active_reference;
CREATE UNIQUE INDEX mercadolibre_payments_active_reference
  ON public.mercadolibre_payments(organization_id, lower(reference_number))
  WHERE status = 'RECORDED';

COMMIT;
