-- Internal read-only primitive. This does not authorize or execute a reversal.
BEGIN;

CREATE FUNCTION accounting.verify_meli_payment_reversal_source(
  p_org_id uuid, p_original_entry_id uuid, p_original_request_key uuid,
  p_original_payload jsonb, p_reversal_request_key uuid, p_reversal_date date,
  p_reversal_description text, p_reversal_actor_id uuid
) RETURNS TABLE (original_entry_id uuid, reversal_entry_id uuid)
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_original uuid;
  v_reversal uuid;
  v_link uuid;
  v_reversal_count bigint;
BEGIN
  IF p_org_id IS NULL OR p_original_entry_id IS NULL OR p_original_request_key IS NULL
    OR p_reversal_request_key IS NULL OR p_reversal_date IS NULL
    OR p_reversal_actor_id IS NULL OR p_reversal_description IS NULL
    OR length(btrim(p_reversal_description)) NOT BETWEEN 1 AND 2000
    OR jsonb_typeof(p_original_payload) IS DISTINCT FROM 'object'
    OR p_original_payload->>'originType' IS DISTINCT FROM 'payment' THEN
    RAISE EXCEPTION 'Datos de verificación de reversión Meli inválidos' USING ERRCODE = '22023';
  END IF;

  -- The reversal writer locks the original before its request key.
  SELECT e.anulado_por_id INTO v_link FROM accounting.journal_entries e
    WHERE e.id = p_original_entry_id AND e.org_id = p_org_id FOR UPDATE;
  IF NOT FOUND OR v_link IS NOT NULL THEN
    RAISE EXCEPTION 'El original Meli no existe o tiene una anulación incompatible';
  END IF;
  PERFORM 1 FROM accounting.journal_entry_lines
    WHERE journal_entry_id = p_original_entry_id FOR SHARE;

  SELECT found.journal_entry_id INTO v_original
    FROM accounting.find_meli_journal_request(
      p_org_id, p_original_request_key, p_original_payload
    ) found;
  IF v_original IS DISTINCT FROM p_original_entry_id THEN
    RAISE EXCEPTION 'El original Meli no coincide con su solicitud durable';
  END IF;

  SELECT found.reversal_entry_id INTO v_reversal
    FROM accounting.find_meli_payment_reversal(
      p_org_id, p_original_entry_id, p_reversal_request_key, p_reversal_date,
      p_reversal_description, p_reversal_actor_id
    ) found;
  IF v_reversal IS NOT NULL THEN
    PERFORM 1 FROM accounting.journal_entries WHERE id = v_reversal FOR UPDATE;
    PERFORM 1 FROM accounting.journal_entry_lines
      WHERE journal_entry_id = v_reversal FOR SHARE;
    SELECT found.reversal_entry_id INTO v_reversal
      FROM accounting.find_meli_payment_reversal(
        p_org_id, p_original_entry_id, p_reversal_request_key, p_reversal_date,
        p_reversal_description, p_reversal_actor_id
      ) found;
    IF v_reversal IS NULL THEN
      RAISE EXCEPTION 'La reversión Meli cambió durante su verificación';
    END IF;
  END IF;
  SELECT count(*) INTO v_reversal_count FROM accounting.journal_entries e
    WHERE e.tipo_evento = 'CONTRA_ASIENTO'
      AND e.referencia_tabla = 'accounting.journal_entries'
      AND e.referencia_id = p_original_entry_id;
  IF (v_reversal IS NULL AND v_reversal_count <> 0)
    OR (v_reversal IS NOT NULL AND v_reversal_count <> 1) THEN
    RAISE EXCEPTION 'El original Meli tiene una reversión inesperada';
  END IF;
  RETURN QUERY SELECT v_original, v_reversal;
END;
$$;

REVOKE ALL ON FUNCTION accounting.verify_meli_payment_reversal_source(
  uuid, uuid, uuid, jsonb, uuid, date, text, uuid
) FROM PUBLIC;

-- Caller must authorize the source and persist the exact request before invoking.
CREATE FUNCTION accounting.reverse_verified_meli_payment(
  p_org_id uuid, p_original_entry_id uuid, p_original_request_key uuid,
  p_original_payload jsonb, p_reversal_request_key uuid, p_reversal_date date,
  p_reversal_description text, p_reversal_actor_id uuid
) RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_existing uuid;
  v_created uuid;
  v_verified uuid;
BEGIN
  SELECT source.reversal_entry_id INTO v_existing
    FROM accounting.verify_meli_payment_reversal_source(
      p_org_id, p_original_entry_id, p_original_request_key, p_original_payload,
      p_reversal_request_key, p_reversal_date, p_reversal_description, p_reversal_actor_id
    ) source;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;
  v_created := accounting.reverse_meli_payment_entry(
    p_org_id, p_original_entry_id, p_reversal_request_key, p_reversal_date,
    p_reversal_description, p_reversal_actor_id
  );
  SELECT source.reversal_entry_id INTO v_verified
    FROM accounting.verify_meli_payment_reversal_source(
      p_org_id, p_original_entry_id, p_original_request_key, p_original_payload,
      p_reversal_request_key, p_reversal_date, p_reversal_description, p_reversal_actor_id
    ) source;
  IF v_created IS NULL OR v_verified IS DISTINCT FROM v_created THEN
    RAISE EXCEPTION 'No se pudo verificar el contra-asiento Meli creado';
  END IF;
  RETURN v_verified;
END;
$$;
REVOKE ALL ON FUNCTION accounting.reverse_verified_meli_payment(
  uuid, uuid, uuid, jsonb, uuid, date, text, uuid
) FROM PUBLIC;
COMMIT;
