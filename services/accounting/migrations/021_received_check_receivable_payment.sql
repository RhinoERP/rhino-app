-- ============================================================
-- 021_received_check_receivable_payment.sql
-- Vincula un cheque recibido con la cobranza (public.receivable_payments)
-- que lo originó, para reabrir la deuda si el cheque es rechazado.
-- Sin FK: la tabla vive en el schema public y la cobranza puede eliminarse.
-- ============================================================

SET search_path TO accounting, public;

ALTER TABLE accounting.received_checks
  ADD COLUMN IF NOT EXISTS receivable_payment_id UUID;

CREATE INDEX IF NOT EXISTS idx_rc_receivable_payment
  ON accounting.received_checks (receivable_payment_id)
  WHERE receivable_payment_id IS NOT NULL;
