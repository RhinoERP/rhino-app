-- Protect the new flow from stale clients and concurrent legacy reversions.
-- No historical remittance, stock balance or order is changed by this migration.
BEGIN;

CREATE FUNCTION public.assert_order_has_no_issued_remittances(p_org_id uuid, p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Same serialization point used by the documented dispatch transaction.
  PERFORM 1 FROM public.organizations WHERE id = p_org_id FOR UPDATE;
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

CREATE FUNCTION public.guard_documented_order_reversion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status::text IN ('CANCELLED', 'PENDING_FINANCE', 'FINANCE_REJECTED', 'PENDING_STOCK',
      'STOCK_OK', 'STOCK_RESERVED', 'PURCHASE_REQUIRED', 'PURCHASING', 'GOODS_RECEIVED',
      'IN_PRODUCTION', 'DESIGN_REVIEW', 'PREPARING') THEN
    -- A parent's aggregate may legitimately move while other children remain
    -- in production. Only cancellation cascades or a documented child itself
    -- are blocked here; the stock/source guards cover legacy undo sagas.
    IF NEW.status::text = 'CANCELLED' OR EXISTS (
      SELECT 1 FROM public.order_remittance_line_sources s
      WHERE s.organization_id = OLD.organization_id AND s.order_id = OLD.id
    ) THEN
      PERFORM public.assert_order_has_no_issued_remittances(OLD.organization_id, OLD.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_documented_reversion_guard
BEFORE UPDATE OF status ON public.orders FOR EACH ROW
EXECUTE FUNCTION public.guard_documented_order_reversion();

CREATE FUNCTION public.guard_documented_quote_item_reassignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org_id uuid;
BEGIN
  IF OLD.assigned_order_id IS NULL OR NEW.assigned_order_id IS NOT DISTINCT FROM OLD.assigned_order_id THEN
    RETURN NEW;
  END IF;
  SELECT o.organization_id INTO STRICT v_org_id FROM public.orders o WHERE o.id = OLD.assigned_order_id;
  PERFORM public.assert_order_has_no_issued_remittances(v_org_id, OLD.assigned_order_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER quote_items_documented_reassignment_guard
BEFORE UPDATE OF assigned_order_id ON public.quote_items FOR EACH ROW
EXECUTE FUNCTION public.guard_documented_quote_item_reassignment();

-- Legacy reversal is a saga: stock reentry runs before order cancellation.
-- Reject inside the atomic reentry RPC too, so its lot UPDATE rolls back if a
-- dispatch won the race after the server's read-only preflight.
CREATE FUNCTION public.guard_documented_order_stock_reentry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order_id uuid;
BEGIN
  IF NEW.type::text = 'INBOUND' AND NEW.reentry_key LIKE 'order-reentry:%' THEN
    v_order_id := split_part(NEW.reentry_key, ':', 2)::uuid;
    PERFORM public.assert_order_has_no_issued_remittances(NEW.organization_id, v_order_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stock_movements_documented_order_reentry_guard
BEFORE INSERT ON public.stock_movements FOR EACH ROW
EXECUTE FUNCTION public.guard_documented_order_stock_reentry();

-- The inverse race: a legacy reentry committed, but its later cancellation
-- has not run yet. The new dispatch must not document that reentered stock.
CREATE FUNCTION public.guard_remittance_source_active_reentry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM public.organizations WHERE id = NEW.organization_id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.stock_movements m
    WHERE m.organization_id = NEW.organization_id AND m.type::text = 'INBOUND'
      AND m.reentry_reversed_at IS NULL
      AND m.reentry_key LIKE 'order-reentry:' || NEW.order_id::text || ':%'
  ) THEN
    RAISE EXCEPTION 'El subpedido tiene un reingreso de stock activo; reconciliá la reversión antes de despachar';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER order_remittance_sources_active_reentry_guard
BEFORE INSERT ON public.order_remittance_line_sources FOR EACH ROW
EXECUTE FUNCTION public.guard_remittance_source_active_reentry();

REVOKE ALL ON FUNCTION public.assert_order_has_no_issued_remittances(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_documented_order_reversion() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_documented_quote_item_reassignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_documented_order_stock_reentry() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_remittance_source_active_reentry() FROM PUBLIC, anon, authenticated;

COMMIT;
