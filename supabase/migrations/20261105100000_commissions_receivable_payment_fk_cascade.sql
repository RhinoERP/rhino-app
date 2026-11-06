-- Commissions depend on the collection payment that generated them.
-- Deleting a payment must also delete its associated commissions.
ALTER TABLE public.commissions
  DROP CONSTRAINT commissions_receivable_payment_id_fkey,
  ADD CONSTRAINT commissions_receivable_payment_id_fkey
    FOREIGN KEY (receivable_payment_id)
    REFERENCES public.receivable_payments(id)
    ON DELETE CASCADE;
