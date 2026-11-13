BEGIN;

-- The fingerprint includes the parent sale used for the invoice reference and
-- carrier. A later invoice authorization does not rewrite an issued snapshot.
CREATE OR REPLACE FUNCTION public.order_remittance_source_fingerprint(
  p_org_id uuid, p_order_ids uuid[]
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH selected_orders AS (
    SELECT o.* FROM public.orders o
    WHERE o.organization_id = p_org_id AND o.id = ANY(p_order_ids)
  ), context_orders AS (
    SELECT o.* FROM public.orders o WHERE o.organization_id = p_org_id
      AND (o.id = ANY(p_order_ids) OR o.id IN (SELECT parent_order_id FROM selected_orders))
  ), context_sales AS (
    SELECT s.* FROM public.sales_orders s WHERE s.organization_id = p_org_id
      AND s.id IN (SELECT sales_order_id FROM context_orders)
  ), selected_items AS (
    SELECT q.* FROM public.quote_items q
    JOIN selected_orders o ON o.id = q.assigned_order_id
  )
  SELECT md5(jsonb_build_object(
    'orders', (SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM context_orders o),
    'sales', (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM context_sales s),
    'carriers', (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.carriers c
      WHERE c.organization_id = p_org_id AND c.id IN (SELECT carrier_id FROM context_sales)),
    'quotes', (SELECT jsonb_agg(to_jsonb(q) ORDER BY q.id)
      FROM public.quotes q WHERE q.organization_id = p_org_id AND q.id IN (SELECT quote_id FROM selected_orders)),
    'customers', (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id)
      FROM public.customers c WHERE c.organization_id = p_org_id AND c.id IN
        (SELECT q.customer_id FROM public.quotes q WHERE q.organization_id = p_org_id
          AND q.id IN (SELECT quote_id FROM selected_orders))),
    'issuer', (SELECT to_jsonb(o) - 'remittance_last_number' - 'updated_at'
      FROM public.organizations o WHERE o.id = p_org_id),
    'settings', (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.organization_id)
      FROM public.organization_settings s WHERE s.organization_id = p_org_id),
    'items', (SELECT jsonb_agg(to_jsonb(q) ORDER BY q.id) FROM selected_items q),
    'extras', (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id)
      FROM public.quote_item_extras e WHERE e.quote_item_id IN (SELECT id FROM selected_items)),
    'sale_items', (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id)
      FROM public.sales_order_items s WHERE s.organization_id = p_org_id
        AND s.quote_item_id IN (SELECT id FROM selected_items)),
    'products', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id)
      FROM public.products p WHERE p.organization_id = p_org_id
        AND p.id IN (SELECT product_id FROM selected_items)),
    'variants', (SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id)
      FROM public.product_variants v WHERE v.organization_id = p_org_id
        AND v.id IN (SELECT product_variant_id FROM selected_items))
  )::text);
$$;

-- Acquire all source locks before entering the older persistence/finalization
-- functions. Their later locks are then reentrant. In particular the sale is
-- locked before its items, as in the commercial sale-update transaction, and
-- the organization counter is locked after the operational rows.
-- NOWAIT handles legacy transactions that acquire rows in another order:
-- retry the whole command instead of holding a row while waiting in a cycle.
CREATE FUNCTION public.lock_order_remittance_dispatch_sources(
  p_org_id uuid, p_actor_id uuid, p_parent_id uuid, p_order_ids uuid[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parent public.orders%ROWTYPE;
  v_current public.orders%ROWTYPE;
  v_sale_ids uuid[];
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Esta operación requiere el servicio de despacho' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.organization_members m
    WHERE m.organization_id = p_org_id AND m.user_id = p_actor_id AND m.is_active
    FOR SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuario fuera de la organización' USING ERRCODE = '42501'; END IF;
  SELECT * INTO STRICT v_parent FROM public.orders o
    WHERE o.organization_id = p_org_id AND o.id = p_parent_id;
  SELECT coalesce(array_agg(DISTINCT o.sales_order_id ORDER BY o.sales_order_id), '{}'::uuid[])
    INTO v_sale_ids FROM public.orders o WHERE o.organization_id = p_org_id
      AND o.sales_order_id IS NOT NULL AND (o.id = p_parent_id OR
        (o.parent_order_id = p_parent_id AND o.id = ANY(p_order_ids)));
  PERFORM s.id FROM public.sales_orders s
    WHERE s.organization_id = p_org_id AND s.id = ANY(v_sale_ids)
    ORDER BY s.id FOR UPDATE NOWAIT;
  IF (SELECT count(*) FROM public.sales_orders s
      WHERE s.organization_id = p_org_id AND s.id = ANY(v_sale_ids)) <> cardinality(v_sale_ids) THEN
    RAISE EXCEPTION 'Una venta no pertenece a la organización';
  END IF;
  PERFORM a.id FROM public.accounts_receivable a
    WHERE a.organization_id = p_org_id AND a.sales_order_id = ANY(v_sale_ids)
    ORDER BY a.id FOR UPDATE NOWAIT;
  PERFORM q.id FROM public.quotes q
    WHERE q.organization_id = p_org_id AND q.id = v_parent.quote_id FOR SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'El presupuesto no pertenece a la organización'; END IF;
  PERFORM c.id FROM public.customers c
    WHERE c.organization_id = p_org_id AND c.id IN (
      SELECT q.customer_id FROM public.quotes q
      WHERE q.organization_id = p_org_id AND q.id = v_parent.quote_id
    ) FOR SHARE NOWAIT;
  PERFORM c.id FROM public.carriers c
    WHERE c.organization_id = p_org_id AND c.id IN (
      SELECT s.carrier_id FROM public.sales_orders s
      WHERE s.organization_id = p_org_id AND s.id = ANY(v_sale_ids)
    ) FOR SHARE NOWAIT;
  SELECT * INTO STRICT v_current FROM public.orders o
    WHERE o.organization_id = p_org_id AND o.id = p_parent_id FOR UPDATE NOWAIT;
  IF v_current.sales_order_id IS DISTINCT FROM v_parent.sales_order_id
     OR v_current.quote_id IS DISTINCT FROM v_parent.quote_id THEN
    RAISE EXCEPTION 'Cambió la venta o el presupuesto del pedido; actualizá la preparación';
  END IF;
  PERFORM o.id FROM public.orders o
    WHERE o.organization_id = p_org_id AND o.parent_order_id = p_parent_id
    ORDER BY o.id FOR UPDATE NOWAIT;
  IF EXISTS (
    SELECT 1 FROM public.orders o WHERE o.organization_id = p_org_id AND o.id = ANY(p_order_ids)
      AND o.sales_order_id IS NOT NULL AND NOT (o.sales_order_id = ANY(v_sale_ids))
  ) THEN RAISE EXCEPTION 'Cambió la venta de un subpedido; actualizá la preparación'; END IF;
  PERFORM q.id FROM public.quote_items q
    WHERE q.assigned_order_id = ANY(p_order_ids) AND q.quote_id = v_parent.quote_id
    ORDER BY q.id FOR UPDATE NOWAIT;
  PERFORM e.id FROM public.quote_item_extras e WHERE e.quote_item_id IN (
    SELECT q.id FROM public.quote_items q
    WHERE q.assigned_order_id = ANY(p_order_ids) AND q.quote_id = v_parent.quote_id
  ) ORDER BY e.id FOR SHARE NOWAIT;
  PERFORM s.id FROM public.sales_order_items s
    WHERE s.organization_id = p_org_id AND s.quote_item_id IN (
      SELECT q.id FROM public.quote_items q
      WHERE q.assigned_order_id = ANY(p_order_ids) AND q.quote_id = v_parent.quote_id
    ) ORDER BY s.id FOR SHARE NOWAIT;
  PERFORM p.id FROM public.products p WHERE p.organization_id = p_org_id AND p.id IN (
    SELECT q.product_id FROM public.quote_items q
    WHERE q.assigned_order_id = ANY(p_order_ids) AND q.quote_id = v_parent.quote_id
  ) ORDER BY p.id FOR SHARE NOWAIT;
  PERFORM v.id FROM public.product_variants v WHERE v.organization_id = p_org_id AND v.id IN (
    SELECT q.product_variant_id FROM public.quote_items q
    WHERE q.assigned_order_id = ANY(p_order_ids) AND q.quote_id = v_parent.quote_id
  ) ORDER BY v.id FOR SHARE NOWAIT;
  PERFORM s.organization_id FROM public.organization_settings s
    WHERE s.organization_id = p_org_id FOR SHARE NOWAIT;
  PERFORM o.id FROM public.organizations o WHERE o.id = p_org_id FOR UPDATE NOWAIT;
END;
$$;

ALTER FUNCTION public.commit_order_remittance_documents(uuid, uuid, uuid, uuid[], uuid, text, boolean, jsonb)
  RENAME TO finalize_order_remittance_dispatch_internal;
REVOKE ALL ON FUNCTION public.finalize_order_remittance_dispatch_internal(uuid, uuid, uuid, uuid[], uuid, text, boolean, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.commit_order_remittance_documents(
  p_org_id uuid, p_actor_id uuid, p_parent_order_id uuid, p_order_ids uuid[],
  p_idempotency_key uuid, p_expected_source_fingerprint text,
  p_automatic_numbering boolean, p_documents jsonb
) RETURNS TABLE (batch_id uuid, remittance_id uuid, document_number text, document_position integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.lock_order_remittance_dispatch_sources(p_org_id, p_actor_id, p_parent_order_id, p_order_ids);
  RETURN QUERY SELECT * FROM public.finalize_order_remittance_dispatch_internal(
    p_org_id, p_actor_id, p_parent_order_id, p_order_ids, p_idempotency_key,
    p_expected_source_fingerprint, p_automatic_numbering, p_documents
  );
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'Hay otra operación en curso sobre este despacho. Reintentá la misma confirmación.'
    USING ERRCODE = '55P03';
END;
$$;

-- These guards may be entered after a legacy UPDATE has locked an order or
-- item. Do not wait for the organization counter while retaining that row.
CREATE OR REPLACE FUNCTION public.assert_order_has_no_issued_remittances(p_org_id uuid, p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM public.organizations WHERE id = p_org_id FOR UPDATE NOWAIT;
  IF EXISTS (
    SELECT 1 FROM public.order_remittance_line_sources s
    JOIN public.order_remittance_lines l ON l.id = s.line_id AND l.organization_id = s.organization_id
    JOIN public.order_remittances r ON r.id = l.remittance_id AND r.organization_id = l.organization_id
    JOIN public.orders o ON o.id = s.order_id AND o.organization_id = s.organization_id
    WHERE s.organization_id = p_org_id AND r.status = 'ISSUED'
      AND (o.id = p_order_id OR o.parent_order_id = p_order_id)
  ) THEN
    RAISE EXCEPTION 'El pedido tiene remitos activos; primero debe resolverse la documentación del despacho';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_order_remittance_dispatch_sources(uuid, uuid, uuid, uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commit_order_remittance_documents(uuid, uuid, uuid, uuid[], uuid, text, boolean, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_order_remittance_documents(uuid, uuid, uuid, uuid[], uuid, text, boolean, jsonb)
  TO service_role;

COMMIT;
