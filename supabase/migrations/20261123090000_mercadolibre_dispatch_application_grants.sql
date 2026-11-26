-- Server-only application grants for the durable Meli dispatch state machine.
-- PUBLIC, anon and authenticated remain revoked. Do not expose these RPCs to a
-- browser client or enable the feature before the server-side checks ship.
BEGIN;

GRANT EXECUTE ON FUNCTION public.begin_meli_payment_dispatch(
  uuid, uuid, uuid, text, uuid, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_meli_payment_dispatch(
  uuid, uuid, uuid, text, uuid, jsonb, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_meli_fiscal_dispatch(
  uuid, uuid, uuid, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_meli_fiscal_dispatch(
  uuid, uuid, uuid, uuid, jsonb, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_meli_payment_reversal(
  uuid, uuid, uuid, uuid, uuid, date, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_meli_payment_reversal_component(
  uuid, uuid, uuid, uuid, text, uuid, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_meli_payment_reversal(
  uuid, uuid, uuid, uuid
) TO service_role;

COMMIT;
