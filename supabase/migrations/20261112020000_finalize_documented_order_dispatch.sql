-- Fase 3: documentos, eventos, estados y deuda operacional en una transacción.
-- Mantiene la firma pública anterior; la persistencia intermedia queda privada.
BEGIN;

ALTER FUNCTION public.commit_order_remittance_documents(uuid, uuid, uuid, uuid[], uuid, text, boolean, jsonb)
  RENAME TO persist_order_remittance_documents_internal;

REVOKE ALL ON FUNCTION public.persist_order_remittance_documents_internal(uuid, uuid, uuid, uuid[], uuid, text, boolean, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.commit_order_remittance_documents(
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
  v_parent public.orders%ROWTYPE;
  v_sale public.sales_orders%ROWTYPE;
  v_child record;
  v_number text;
  v_packages integer;
  v_declared numeric;
  v_new_status public.order_flow_status;
  v_event_count integer;
  v_now timestamptz := clock_timestamp();
  v_has_unassigned boolean;
  v_requires_fiscal boolean;
BEGIN
  -- La función interna comprueba rol de servicio, actor, alcance, estado,
  -- huella, cantidades, idempotencia, números y cobertura total de los ítems.
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
    -- Una respuesta perdida no vuelve a cambiar estados ni crear deuda.
    IF v_event_count <> cardinality(p_order_ids) OR EXISTS (
      SELECT 1 FROM public.order_dispatch_events e
      WHERE e.dispatch_group_id = v_group_id AND NOT (e.order_id = ANY(p_order_ids))
    ) THEN RAISE EXCEPTION 'El despacho guardado está incompleto; requiere revisión'; END IF;
    RETURN QUERY SELECT r.batch_id, r.id, r.document_number, r.document_position
      FROM public.order_remittances r WHERE r.batch_id = v_batch_id ORDER BY r.document_position;
    RETURN;
  END IF;

  SELECT * INTO STRICT v_parent FROM public.orders o
    WHERE o.id = p_parent_order_id AND o.organization_id = p_org_id FOR UPDATE;
  IF v_parent.status::text IN ('CANCELLED', 'DELIVERED', 'FINANCE_REJECTED') THEN
    RAISE EXCEPTION 'El pedido padre no está habilitado para despachar';
  END IF;
  PERFORM o.id FROM public.orders o
    WHERE o.organization_id = p_org_id AND o.parent_order_id = p_parent_order_id
    ORDER BY o.id FOR UPDATE;

  IF v_parent.sales_order_id IS NOT NULL THEN
    SELECT * INTO STRICT v_sale FROM public.sales_orders s
      WHERE s.id = v_parent.sales_order_id AND s.organization_id = p_org_id FOR UPDATE;
    -- Los subpedidos en preparación ya deben tener la venta confirmada.
    -- No se llama a una confirmación con descuento de stock durante el despacho.
    IF v_sale.status::text NOT IN ('CONFIRMED', 'DISPATCH') THEN
      RAISE EXCEPTION 'La venta debe estar confirmada antes de despachar; requiere revisión';
    END IF;
  END IF;

  FOR v_child IN
    SELECT o.id, o.status FROM public.orders o
    WHERE o.organization_id = p_org_id AND o.id = ANY(p_order_ids) ORDER BY o.id
  LOOP
    IF v_child.status::text <> 'PREPARING' THEN
      RAISE EXCEPTION 'El estado del subpedido cambió durante la confirmación';
    END IF;
    -- El evento conserva una referencia representativa para compatibilidad.
    -- Los documentos y sus orígenes son la fuente real de la composición.
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

  SELECT EXISTS (
    SELECT 1 FROM public.quote_items q
    WHERE q.quote_id = v_parent.quote_id AND q.assigned_order_id IS NULL
  ) INTO v_has_unassigned;
  IF v_has_unassigned THEN
    -- Mismo criterio del flujo existente: no avanzar el padre mientras tiene
    -- ítems sueltos y conservar su estado si ya pasó la revisión de stock.
    v_new_status := CASE WHEN v_parent.status::text IN (
      'STOCK_OK', 'PURCHASE_REQUIRED', 'PURCHASING', 'GOODS_RECEIVED',
      'STOCK_RESERVED', 'IN_PRODUCTION', 'DESIGN_REVIEW', 'PREPARING',
      'DISPATCHED', 'DELIVERED'
    ) THEN v_parent.status ELSE 'PENDING_STOCK'::public.order_flow_status END;
  ELSE
    SELECT o.status INTO STRICT v_new_status FROM public.orders o
    WHERE o.organization_id = p_org_id AND o.parent_order_id = p_parent_order_id
      AND o.status::text NOT IN ('DELIVERED', 'CANCELLED')
    ORDER BY CASE o.status::text
      WHEN 'PENDING_FINANCE' THEN 0 WHEN 'FINANCE_REJECTED' THEN 0 WHEN 'STOCK_OK' THEN 0
      WHEN 'STOCK_RESERVED' THEN 1 WHEN 'PURCHASE_REQUIRED' THEN 1 WHEN 'PURCHASING' THEN 2
      WHEN 'GOODS_RECEIVED' THEN 3 WHEN 'PENDING_STOCK' THEN 4 WHEN 'IN_PRODUCTION' THEN 5
      WHEN 'DESIGN_REVIEW' THEN 6 WHEN 'PREPARING' THEN 7 WHEN 'DISPATCHED' THEN 8
      ELSE 99 END, o.id LIMIT 1;
    IF v_new_status::text = 'PURCHASE_REQUIRED' AND EXISTS (
      SELECT 1 FROM public.orders o WHERE o.organization_id = p_org_id
        AND o.parent_order_id = p_parent_order_id AND o.status = 'GOODS_RECEIVED'
    ) THEN v_new_status := 'GOODS_RECEIVED'; END IF;
  END IF;

  IF v_parent.status IS DISTINCT FROM v_new_status THEN
    UPDATE public.orders SET status = v_new_status, updated_at = v_now
      WHERE id = p_parent_order_id AND organization_id = p_org_id;
    INSERT INTO public.order_status_history (
      order_id, from_status, to_status, notes, changed_by, changed_at
    ) VALUES (p_parent_order_id, v_parent.status, v_new_status,
      'Recalculado automáticamente por despacho documentado', p_actor_id, v_now);
  END IF;

  IF v_parent.sales_order_id IS NOT NULL AND v_new_status::text = 'DISPATCHED'
      AND v_sale.status::text = 'CONFIRMED' THEN
    UPDATE public.sales_orders SET status = 'DISPATCH', dispatched_at = v_now, updated_at = v_now
      WHERE id = v_sale.id AND organization_id = p_org_id;
    v_requires_fiscal := public.organization_uses_invoice_backed_debt(p_org_id)
      AND v_sale.invoice_type::text IS DISTINCT FROM 'NOTA_DE_VENTA';
    -- Igual que updateReceivableForDispatchedSale: no tocar una cuenta existente;
    -- con deuda fiscal los comprobantes son responsables de crear la cuenta.
    IF NOT v_requires_fiscal AND v_sale.customer_id IS NOT NULL THEN
      INSERT INTO public.accounts_receivable (
        organization_id, customer_id, sales_order_id, total_amount,
        pending_balance, currency, due_date, status
      ) SELECT p_org_id, v_sale.customer_id, v_sale.id, trunc(coalesce(v_sale.total_amount, 0), 2),
        trunc(coalesce(v_sale.total_amount, 0), 2), coalesce(v_sale.currency, 'ARS'),
        (v_now AT TIME ZONE 'UTC')::date + coalesce(v_sale.credit_days, 0),
        'PENDING'::public.receivable_status
      WHERE NOT EXISTS (
        SELECT 1 FROM public.accounts_receivable a
        WHERE a.organization_id = p_org_id AND a.sales_order_id = v_sale.id
      ) ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN QUERY SELECT r.batch_id, r.id, r.document_number, r.document_position
    FROM public.order_remittances r WHERE r.batch_id = v_batch_id ORDER BY r.document_position;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_order_remittance_documents(uuid, uuid, uuid, uuid[], uuid, text, boolean, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_order_remittance_documents(uuid, uuid, uuid, uuid[], uuid, text, boolean, jsonb)
  TO service_role;

COMMIT;
