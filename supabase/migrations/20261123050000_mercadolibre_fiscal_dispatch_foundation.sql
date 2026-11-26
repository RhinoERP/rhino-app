-- Internal foundation only. It does not expose a fiscal publisher.
BEGIN;

CREATE TABLE public.mercadolibre_fiscal_accounting_dispatches (
  preparation_id uuid PRIMARY KEY
    REFERENCES public.mercadolibre_fiscal_accounting_preparations(id),
  request_key uuid NOT NULL UNIQUE,
  request_payload jsonb NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  status text NOT NULL CHECK (status IN ('UNCERTAIN', 'PUBLISHED')),
  journal_entry_id uuid UNIQUE,
  initiated_by uuid NOT NULL REFERENCES auth.users(id),
  initiated_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid REFERENCES auth.users(id),
  published_at timestamptz,
  CHECK (
    (status = 'UNCERTAIN' AND journal_entry_id IS NULL AND published_by IS NULL AND published_at IS NULL)
    OR
    (status = 'PUBLISHED' AND journal_entry_id IS NOT NULL AND published_by IS NOT NULL AND published_at IS NOT NULL)
  )
);

ALTER TABLE public.mercadolibre_fiscal_accounting_dispatches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mercadolibre_fiscal_accounting_dispatches
  FROM PUBLIC, anon, authenticated, service_role;

-- This does not validate account assignments, antecedents or reconciliation.
-- The future orchestrator must validate those before dispatching.
CREATE FUNCTION public.begin_meli_fiscal_dispatch(
  p_org_id uuid, p_actor_id uuid, p_preparation_id uuid, p_request_payload jsonb
) RETURNS TABLE (dispatch_status text, journal_entry_id uuid, idempotent boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_preparation public.mercadolibre_fiscal_accounting_preparations%ROWTYPE;
  v_existing public.mercadolibre_fiscal_accounting_dispatches%ROWTYPE;
  v_verified_id uuid;
  v_line jsonb;
BEGIN
  IF p_org_id IS NULL OR p_actor_id IS NULL OR p_preparation_id IS NULL
    OR jsonb_typeof(p_request_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Datos del envío fiscal inválidos' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_preparation FROM public.mercadolibre_fiscal_accounting_preparations
    WHERE id = p_preparation_id AND organization_id = p_org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Preparación fiscal no encontrada'; END IF;
  IF v_preparation.created_by IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'Solo el autor puede iniciar esta preparación fiscal'
      USING ERRCODE = '42501';
  END IF;

  -- Revalidates access, warehouse and the source under the same row locks.
  SELECT preparation_id INTO v_verified_id FROM public.prepare_meli_fiscal_accounting(
    p_org_id, p_actor_id, v_preparation.sale_id, v_preparation.origin_type,
    v_preparation.origin_id, v_preparation.request_key
  );
  IF v_verified_id IS DISTINCT FROM p_preparation_id THEN
    RAISE EXCEPTION 'La fuente fiscal no coincide con la preparación';
  END IF;
  SELECT * INTO v_preparation FROM public.mercadolibre_fiscal_accounting_preparations
    WHERE id = p_preparation_id AND organization_id = p_org_id FOR UPDATE;
  IF p_request_payload->>'orgId' IS DISTINCT FROM p_org_id::text
    OR p_request_payload->>'originType' IS DISTINCT FROM v_preparation.origin_type
    OR p_request_payload->>'originId' IS DISTINCT FROM v_preparation.origin_id::text
    OR p_request_payload->>'componentKey' IS DISTINCT FROM 'fiscal'
    OR p_request_payload->>'requestKey' IS DISTINCT FROM v_preparation.request_key::text
    OR p_request_payload->>'actorId' IS DISTINCT FROM p_actor_id::text
    OR p_request_payload->>'currency' IS DISTINCT FROM v_preparation.source_snapshot->>'currency'
    OR p_request_payload - ARRAY[
      'orgId', 'originType', 'originId', 'componentKey', 'requestKey', 'date',
      'description', 'actorId', 'currency', 'exchangeRate', 'lines'
    ] <> '{}'::jsonb
    OR jsonb_typeof(p_request_payload->'date') IS DISTINCT FROM 'string'
    OR p_request_payload->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    OR jsonb_typeof(p_request_payload->'description') IS DISTINCT FROM 'string'
    OR length(btrim(p_request_payload->>'description')) NOT BETWEEN 1 AND 2000
    OR jsonb_typeof(p_request_payload->'exchangeRate') IS DISTINCT FROM 'string'
    OR p_request_payload->>'exchangeRate' !~ '^(0|[1-9][0-9]{0,5})(\.[0-9]{1,4})?$'
    OR jsonb_typeof(p_request_payload->'lines') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'El envío no coincide con la preparación fiscal' USING ERRCODE = '22023';
  END IF;
  IF (p_request_payload->>'date')::date::text IS DISTINCT FROM p_request_payload->>'date'
    OR (p_request_payload->>'exchangeRate')::numeric <= 0
    OR (v_preparation.source_snapshot->>'currency' = 'ARS'
      AND (p_request_payload->>'exchangeRate')::numeric <> 1)
    OR jsonb_array_length(p_request_payload->'lines') NOT BETWEEN 2 AND 200 THEN
    RAISE EXCEPTION 'Importes o fecha del envío fiscal inválidos' USING ERRCODE = '22023';
  END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_request_payload->'lines') LOOP
    IF jsonb_typeof(v_line) IS DISTINCT FROM 'object'
      OR v_line - ARRAY['accountId', 'side', 'originalAmount', 'pesosAmount'] <> '{}'::jsonb
      OR jsonb_typeof(v_line->'accountId') IS DISTINCT FROM 'string'
      OR v_line->>'accountId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR jsonb_typeof(v_line->'side') IS DISTINCT FROM 'string'
      OR v_line->>'side' NOT IN ('DEBE', 'HABER')
      OR jsonb_typeof(v_line->'originalAmount') IS DISTINCT FROM 'string'
      OR v_line->>'originalAmount' !~ '^(0|[1-9][0-9]{0,10})(\.[0-9]{1,2})?$'
      OR jsonb_typeof(v_line->'pesosAmount') IS DISTINCT FROM 'string'
      OR v_line->>'pesosAmount' !~ '^(0|[1-9][0-9]{0,10})(\.[0-9]{1,2})?$' THEN
      RAISE EXCEPTION 'Línea fiscal inválida' USING ERRCODE = '22023';
    END IF;
    IF (v_line->>'originalAmount')::numeric <= 0 OR (v_line->>'pesosAmount')::numeric <= 0 THEN
      RAISE EXCEPTION 'Importe de línea fiscal inválido' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT * INTO v_existing FROM public.mercadolibre_fiscal_accounting_dispatches
    WHERE preparation_id = p_preparation_id;
  IF FOUND THEN
    IF v_existing.request_key IS DISTINCT FROM v_preparation.request_key
      OR v_existing.request_payload IS DISTINCT FROM p_request_payload
      OR v_existing.initiated_by IS DISTINCT FROM p_actor_id THEN
      RAISE EXCEPTION 'La preparación ya corresponde a otro envío fiscal' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT v_existing.status, v_existing.journal_entry_id, true;
    RETURN;
  END IF;
  INSERT INTO public.mercadolibre_fiscal_accounting_dispatches (
    preparation_id, request_key, request_payload, status, initiated_by
  ) VALUES (
    p_preparation_id, v_preparation.request_key, p_request_payload, 'UNCERTAIN', p_actor_id
  );
  RETURN QUERY SELECT 'UNCERTAIN'::text, NULL::uuid, false;
END;
$$;

-- Caller must independently verify the exact receipt before confirming.
CREATE FUNCTION public.confirm_meli_fiscal_dispatch(
  p_org_id uuid, p_actor_id uuid, p_preparation_id uuid,
  p_request_key uuid, p_request_payload jsonb, p_journal_entry_id uuid
) RETURNS TABLE (dispatch_status text, journal_entry_id uuid, idempotent boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_preparation public.mercadolibre_fiscal_accounting_preparations%ROWTYPE;
  v_existing public.mercadolibre_fiscal_accounting_dispatches%ROWTYPE;
  v_verified_id uuid;
BEGIN
  IF p_org_id IS NULL OR p_actor_id IS NULL OR p_preparation_id IS NULL
    OR p_request_key IS NULL OR p_journal_entry_id IS NULL
    OR jsonb_typeof(p_request_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Confirmación fiscal inválida' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_preparation FROM public.mercadolibre_fiscal_accounting_preparations
    WHERE id = p_preparation_id AND organization_id = p_org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Preparación fiscal no encontrada'; END IF;
  SELECT preparation_id INTO v_verified_id
    FROM public.get_meli_fiscal_accounting_preparation(
      p_org_id, p_actor_id, v_preparation.sale_id,
      v_preparation.origin_type, v_preparation.origin_id
    );
  IF v_verified_id IS DISTINCT FROM p_preparation_id THEN
    RAISE EXCEPTION 'Preparación fiscal no encontrada';
  END IF;
  SELECT * INTO v_existing FROM public.mercadolibre_fiscal_accounting_dispatches
    WHERE preparation_id = p_preparation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Envío fiscal no encontrado'; END IF;
  IF v_existing.request_key IS DISTINCT FROM p_request_key
    OR v_existing.request_payload IS DISTINCT FROM p_request_payload THEN
    RAISE EXCEPTION 'La confirmación no coincide con el envío fiscal' USING ERRCODE = '22023';
  END IF;
  IF v_existing.status = 'PUBLISHED' THEN
    IF v_existing.journal_entry_id IS DISTINCT FROM p_journal_entry_id THEN
      RAISE EXCEPTION 'El envío ya está vinculado a otro asiento' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT v_existing.status, v_existing.journal_entry_id, true;
    RETURN;
  END IF;
  UPDATE public.mercadolibre_fiscal_accounting_dispatches d
    SET status = 'PUBLISHED', journal_entry_id = p_journal_entry_id,
      published_by = p_actor_id, published_at = now()
    WHERE d.preparation_id = p_preparation_id;
  RETURN QUERY SELECT 'PUBLISHED'::text, p_journal_entry_id, false;
END;
$$;

CREATE FUNCTION public.get_meli_fiscal_dispatch_for_recovery(
  p_org_id uuid, p_actor_id uuid, p_sale_id uuid, p_origin_type text, p_origin_id uuid
) RETURNS TABLE (
  request_key uuid, request_payload jsonb, dispatch_status text,
  journal_entry_id uuid, initiated_by uuid, initiated_at timestamptz,
  published_by uuid, published_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_preparation_id uuid;
BEGIN
  SELECT preparation_id INTO v_preparation_id
    FROM public.get_meli_fiscal_accounting_preparation(
      p_org_id, p_actor_id, p_sale_id, p_origin_type, p_origin_id
    );
  IF v_preparation_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT d.request_key, d.request_payload, d.status, d.journal_entry_id,
      d.initiated_by, d.initiated_at, d.published_by, d.published_at
    FROM public.mercadolibre_fiscal_accounting_dispatches d
    WHERE d.preparation_id = v_preparation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_meli_fiscal_dispatch(uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.confirm_meli_fiscal_dispatch(uuid, uuid, uuid, uuid, jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_meli_fiscal_dispatch_for_recovery(uuid, uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_meli_fiscal_dispatch_for_recovery(uuid, uuid, uuid, text, uuid)
  TO service_role;
COMMIT;
