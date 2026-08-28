-- Repair installations where the initial supplier invoices migration was run
-- from the SQL editor before all of its statements completed.

ALTER TABLE public.supplier_invoices
  DROP CONSTRAINT IF EXISTS supplier_invoices_document_unique,
  DROP CONSTRAINT IF EXISTS supplier_invoices_invoice_type_check,
  DROP CONSTRAINT IF EXISTS supplier_invoices_total_amount_check;

CREATE UNIQUE INDEX IF NOT EXISTS supplier_invoices_document_unique
  ON public.supplier_invoices (
    organization_id,
    supplier_id,
    invoice_type,
    COALESCE(point_of_sale, ''),
    invoice_number
  );

ALTER TABLE public.supplier_invoices
  ADD CONSTRAINT supplier_invoices_invoice_type_check
    CHECK (invoice_type IN ('A', 'B', 'C', 'M', 'E', 'Otro')),
  ADD CONSTRAINT supplier_invoices_total_amount_check
    CHECK (total_amount >= 0 AND total_amount = subtotal_amount + tax_amount);

CREATE OR REPLACE FUNCTION public.validate_supplier_invoice_relations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  supplier_organization_id UUID;
  purchase_order_organization_id UUID;
  purchase_order_supplier_id UUID;
BEGIN
  SELECT organization_id
    INTO supplier_organization_id
    FROM public.suppliers
    WHERE id = NEW.supplier_id;

  IF supplier_organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'El proveedor debe pertenecer a la misma organización que la factura';
  END IF;

  IF NEW.purchase_order_id IS NOT NULL THEN
    SELECT organization_id, supplier_id
      INTO purchase_order_organization_id, purchase_order_supplier_id
      FROM public.purchase_orders
      WHERE id = NEW.purchase_order_id;

    IF purchase_order_organization_id IS DISTINCT FROM NEW.organization_id
      OR purchase_order_supplier_id IS DISTINCT FROM NEW.supplier_id THEN
      RAISE EXCEPTION 'La orden de compra debe pertenecer al proveedor y a la organización de la factura';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_supplier_invoice_relations
  ON public.supplier_invoices;
CREATE TRIGGER validate_supplier_invoice_relations
  BEFORE INSERT OR UPDATE OF organization_id, supplier_id, purchase_order_id
  ON public.supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION public.validate_supplier_invoice_relations();

DROP TRIGGER IF EXISTS update_supplier_invoices_updated_at
  ON public.supplier_invoices;
CREATE TRIGGER update_supplier_invoices_updated_at
  BEFORE UPDATE ON public.supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_supplier_invoices(
  p_organization_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    LEFT JOIN public.role_permissions rp ON rp.role_id = om.role_id
    LEFT JOIN public.permissions p ON p.id = rp.permission_id
    WHERE om.organization_id = p_organization_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
      AND (
        om.is_owner = true OR p.key IN (
          'organization.admin', 'purchases.manage', 'purchases.manage.all'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_all_supplier_invoices(
  p_organization_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    LEFT JOIN public.role_permissions rp ON rp.role_id = om.role_id
    LEFT JOIN public.permissions p ON p.id = rp.permission_id
    WHERE om.organization_id = p_organization_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
      AND (
        om.is_owner = true OR p.key IN (
          'organization.admin', 'purchases.manage.all'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_supplier_invoice(
  p_organization_id UUID,
  p_created_by UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    LEFT JOIN public.role_permissions rp ON rp.role_id = om.role_id
    LEFT JOIN public.permissions p ON p.id = rp.permission_id
    WHERE om.organization_id = p_organization_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
      AND (
        om.is_owner = true
        OR p.key IN (
          'organization.admin', 'purchases.read.all', 'purchases.manage.all'
        )
        OR (
          p_created_by = auth.uid()
          AND p.key IN ('purchases.read', 'purchases.manage')
        )
      )
  );
$$;

DROP POLICY IF EXISTS supplier_invoices_org_member_access
  ON public.supplier_invoices;
DROP POLICY IF EXISTS supplier_invoices_authorized_read
  ON public.supplier_invoices;
DROP POLICY IF EXISTS supplier_invoices_authorized_insert
  ON public.supplier_invoices;
DROP POLICY IF EXISTS supplier_invoices_authorized_update
  ON public.supplier_invoices;
DROP POLICY IF EXISTS supplier_invoices_authorized_delete
  ON public.supplier_invoices;

CREATE POLICY supplier_invoices_authorized_read
  ON public.supplier_invoices FOR SELECT
  USING (public.can_read_supplier_invoice(organization_id, created_by));

CREATE POLICY supplier_invoices_authorized_insert
  ON public.supplier_invoices FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND public.can_manage_supplier_invoices(organization_id)
  );

CREATE POLICY supplier_invoices_authorized_update
  ON public.supplier_invoices FOR UPDATE
  USING (
    public.can_manage_supplier_invoices(organization_id)
    AND (
      created_by = auth.uid()
      OR public.can_manage_all_supplier_invoices(organization_id)
    )
  )
  WITH CHECK (
    public.can_manage_supplier_invoices(organization_id)
    AND (
      created_by = auth.uid()
      OR public.can_manage_all_supplier_invoices(organization_id)
    )
  );

CREATE POLICY supplier_invoices_authorized_delete
  ON public.supplier_invoices FOR DELETE
  USING (
    public.can_manage_supplier_invoices(organization_id)
    AND (
      created_by = auth.uid()
      OR public.can_manage_all_supplier_invoices(organization_id)
    )
  );
