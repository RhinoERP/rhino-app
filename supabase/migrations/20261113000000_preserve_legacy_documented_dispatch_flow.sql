-- Split the documentation into sheets without introducing sale eligibility
-- rules or a second implementation of parent/sale/receivable synchronization.
-- The server performs the existing recalcParentOrderStatus after dispatch,
-- exactly as dispatchChildOrders does for legacy remittances.
BEGIN;

CREATE OR REPLACE FUNCTION public.finalize_order_remittance_dispatch_internal(
  p_org_id uuid,
  p_actor_id uuid,
  p_parent_order_id uuid,
  p_order_ids uuid[],
  p_idempotency_key uuid,
  p_expected_source_fingerprint text,
  p_automatic_numbering boolean,
  p_documents jsonb
) RETURNS TABLE (
  batch_id uuid,
  remittance_id uuid,
  document_number text,
  document_position integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_documents jsonb;
  v_batch_id uuid;
  v_group_id uuid;
  v_child record;
  v_number text;
  v_packages integer;
  v_declared numeric;
  v_event_count integer;
  v_now timestamptz := clock_timestamp();
BEGIN
  SELECT jsonb_agg(to_jsonb(r) ORDER BY r.document_position)
    INTO v_documents
    FROM public.persist_order_remittance_documents_internal(
      p_org_id, p_actor_id, p_parent_order_id, p_order_ids,
      p_idempotency_key, p_expected_source_fingerprint,
      p_automatic_numbering, p_documents
    ) r;

  v_batch_id := (v_documents->0->>'batch_id')::uuid;
  SELECT b.dispatch_group_id INTO STRICT v_group_id
    FROM public.order_remittance_batches b WHERE b.id = v_batch_id;

  SELECT count(*) INTO v_event_count FROM public.order_dispatch_events e
    WHERE e.dispatch_group_id = v_group_id;
  IF v_event_count > 0 THEN
    IF v_event_count <> cardinality(p_order_ids) OR EXISTS (
      SELECT 1 FROM public.order_dispatch_events e
      WHERE e.dispatch_group_id = v_group_id AND NOT (e.order_id = ANY(p_order_ids))
    ) THEN RAISE EXCEPTION 'El despacho guardado está incompleto; requiere revisión'; END IF;
    RETURN QUERY SELECT r.batch_id, r.id, r.document_number, r.document_position
      FROM public.order_remittances r WHERE r.batch_id = v_batch_id ORDER BY r.document_position;
    RETURN;
  END IF;

  FOR v_child IN
    SELECT o.id, o.status FROM public.orders o
    WHERE o.organization_id = p_org_id AND o.id = ANY(p_order_ids) ORDER BY o.id
  LOOP
    IF v_child.status::text <> 'PREPARING' THEN
      RAISE EXCEPTION 'El estado del subpedido cambió durante la confirmación';
    END IF;
    SELECT r.document_number, r.package_count, r.declared_value
      INTO STRICT v_number, v_packages, v_declared
      FROM public.order_remittances r
      WHERE r.batch_id = v_batch_id AND EXISTS (
        SELECT 1 FROM public.order_remittance_lines l
        JOIN public.order_remittance_line_sources s ON s.line_id = l.id
        WHERE l.remittance_id = r.id AND s.order_id = v_child.id
      ) ORDER BY r.document_position LIMIT 1;
    INSERT INTO public.order_dispatch_events (
      order_id, remito_number, dispatch_group_id, dispatched_at,
      package_count, declared_value, notes
    ) VALUES (
      v_child.id, v_number, v_group_id, v_now, v_packages, v_declared,
      'Despacho documentado; consultar composición en los remitos del lote'
    );
    UPDATE public.orders SET status = 'DISPATCHED', updated_at = v_now
      WHERE id = v_child.id AND organization_id = p_org_id;
    INSERT INTO public.order_status_history (
      order_id, from_status, to_status, notes, changed_by, changed_at
    ) VALUES (
      v_child.id, 'PREPARING', 'DISPATCHED',
      'Despachado con remitos: ' || (
        SELECT string_agg(r.document_number, ', ' ORDER BY r.document_position)
        FROM public.order_remittances r WHERE r.batch_id = v_batch_id
          AND EXISTS (
            SELECT 1 FROM public.order_remittance_lines l
            JOIN public.order_remittance_line_sources s ON s.line_id = l.id
            WHERE l.remittance_id = r.id AND s.order_id = v_child.id
          )
      ), p_actor_id, v_now
    );
  END LOOP;

  RETURN QUERY SELECT r.batch_id, r.id, r.document_number, r.document_position
    FROM public.order_remittances r WHERE r.batch_id = v_batch_id ORDER BY r.document_position;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_order_remittance_dispatch_internal(uuid, uuid, uuid, uuid[], uuid, text, boolean, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
