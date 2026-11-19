-- Fase 1: modelo documental. No cambia remitos ni despachos existentes.
-- Las escrituras desde la aplicación se habilitarán exclusivamente mediante
-- una RPC transaccional en la siguiente fase; no hay escritura directa del cliente.
BEGIN;

CREATE TABLE public.order_remittance_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  parent_order_id uuid NOT NULL REFERENCES public.orders(id),
  dispatch_group_id uuid NOT NULL UNIQUE,
  idempotency_key uuid NOT NULL,
  request_fingerprint text NOT NULL CHECK (length(request_fingerprint) > 0),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key),
  UNIQUE (organization_id, id)
);

CREATE TABLE public.order_remittances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  batch_id uuid NOT NULL,
  document_number text NOT NULL
    CHECK (document_number = btrim(document_number) AND length(document_number) > 0),
  document_position integer NOT NULL CHECK (document_position > 0),
  issue_date date NOT NULL,
  status text NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED', 'VOIDED')),
  package_count integer CHECK (package_count >= 0),
  declared_value numeric(20,2) CHECK (declared_value >= 0 AND declared_value <> 'NaN'::numeric),
  subtotal numeric(20,2) NOT NULL CHECK (subtotal >= 0 AND subtotal <> 'NaN'::numeric),
  discount_total numeric(20,2) NOT NULL CHECK (discount_total >= 0 AND discount_total <= subtotal),
  total numeric(20,2) NOT NULL CHECK (total = subtotal - discount_total),
  currency text NOT NULL CHECK (length(btrim(currency)) > 0),
  -- Datos de emisor/receptor, transporte, OC, observaciones y configuración
  -- de presentación. Se validarán con un esquema versionado en el servidor.
  snapshot_version integer NOT NULL DEFAULT 1 CHECK (snapshot_version = 1),
  header_snapshot jsonb NOT NULL CHECK (jsonb_typeof(header_snapshot) = 'object'),
  pdf_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  void_reason text,
  CONSTRAINT order_remittances_batch_org_fk
    FOREIGN KEY (organization_id, batch_id)
    REFERENCES public.order_remittance_batches(organization_id, id),
  CONSTRAINT order_remittances_void_state_check CHECK (
    (status = 'ISSUED' AND voided_at IS NULL AND void_reason IS NULL)
    OR (status = 'VOIDED' AND voided_at IS NOT NULL
        AND void_reason IS NOT NULL AND length(btrim(void_reason)) > 0)
  ),
  UNIQUE (organization_id, document_number),
  UNIQUE (batch_id, document_position),
  UNIQUE (organization_id, id)
);

CREATE TABLE public.order_remittance_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  remittance_id uuid NOT NULL,
  line_position integer NOT NULL CHECK (line_position BETWEEN 1 AND 26),
  product_id uuid REFERENCES public.products(id),
  product_variant_id uuid REFERENCES public.product_variants(id),
  sku text NOT NULL,
  product_name text NOT NULL CHECK (length(btrim(product_name)) > 0),
  brand text,
  variant_name text,
  unit_of_measure public.unit_of_measure_type NOT NULL,
  quantity numeric(20,6) NOT NULL CHECK (quantity > 0 AND quantity <> 'NaN'::numeric),
  weight_quantity numeric(20,6) CHECK (weight_quantity >= 0 AND weight_quantity <> 'NaN'::numeric),
  unit_price numeric(20,6) NOT NULL CHECK (unit_price >= 0 AND unit_price <> 'NaN'::numeric),
  subtotal numeric(20,6) NOT NULL CHECK (subtotal >= 0 AND subtotal <> 'NaN'::numeric),
  discount_percentage numeric(7,4) CHECK (discount_percentage BETWEEN 0 AND 100),
  extras_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(extras_snapshot) = 'array'),
  CONSTRAINT order_remittance_lines_document_org_fk
    FOREIGN KEY (organization_id, remittance_id)
    REFERENCES public.order_remittances(organization_id, id),
  UNIQUE (remittance_id, line_position),
  UNIQUE (organization_id, id)
);

-- Una línea impresa puede agrupar contribuciones de distintos subpedidos.
-- RESTRICT (por defecto) impide borrar una fuente ya documentada.
CREATE TABLE public.order_remittance_line_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  line_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id),
  quote_item_id uuid NOT NULL REFERENCES public.quote_items(id),
  quantity numeric(20,6) NOT NULL CHECK (quantity > 0 AND quantity <> 'NaN'::numeric),
  CONSTRAINT order_remittance_sources_line_org_fk
    FOREIGN KEY (organization_id, line_id)
    REFERENCES public.order_remittance_lines(organization_id, id),
  UNIQUE (line_id, order_id, quote_item_id)
);

CREATE INDEX order_remittance_batches_parent_idx
  ON public.order_remittance_batches (parent_order_id);
CREATE INDEX order_remittances_org_date_idx
  ON public.order_remittances (organization_id, issue_date DESC);
CREATE INDEX order_remittance_lines_product_idx
  ON public.order_remittance_lines (product_id);
CREATE INDEX order_remittance_lines_variant_idx
  ON public.order_remittance_lines (product_variant_id);
CREATE INDEX order_remittance_sources_order_idx
  ON public.order_remittance_line_sources (order_id);
CREATE INDEX order_remittance_sources_quote_item_idx
  ON public.order_remittance_line_sources (quote_item_id);

-- Lectura del documento según membresía activa, permisos de pedidos
-- y alcance propio/todos. Las escrituras no se conceden a authenticated.
CREATE FUNCTION public.can_read_order_remittance_batch(p_batch_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.order_remittance_batches b
    JOIN public.orders o
      ON o.id = b.parent_order_id AND o.organization_id = b.organization_id
    JOIN public.organization_members m
      ON m.organization_id = b.organization_id
     AND m.user_id = auth.uid()
     AND m.is_active
    WHERE b.id = p_batch_id
      AND (
        public.user_has_org_permission('organization.admin', b.organization_id)
        OR public.user_has_org_permission('orders.read.all', b.organization_id)
        OR public.user_has_org_permission('orders.manage.all', b.organization_id)
        OR (
          o.created_by = auth.uid()
          AND (
            public.user_has_org_permission('orders.read', b.organization_id)
            OR public.user_has_org_permission('orders.manage', b.organization_id)
            OR public.user_has_org_permission('orders.dispatch', b.organization_id)
          )
        )
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.can_read_order_remittance_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_order_remittance_batch(uuid) TO authenticated;

ALTER TABLE public.order_remittance_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_remittances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_remittance_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_remittance_line_sources ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.order_remittance_batches,
  public.order_remittances, public.order_remittance_lines,
  public.order_remittance_line_sources FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.order_remittance_batches,
  public.order_remittances, public.order_remittance_lines,
  public.order_remittance_line_sources TO authenticated;

GRANT ALL ON TABLE public.order_remittance_batches,
  public.order_remittances, public.order_remittance_lines,
  public.order_remittance_line_sources TO service_role;

CREATE POLICY order_remittance_batches_read
  ON public.order_remittance_batches FOR SELECT TO authenticated
  USING (public.can_read_order_remittance_batch(id));

CREATE POLICY order_remittances_read
  ON public.order_remittances FOR SELECT TO authenticated
  USING (public.can_read_order_remittance_batch(batch_id));

CREATE POLICY order_remittance_lines_read
  ON public.order_remittance_lines FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.order_remittances r
    WHERE r.id = order_remittance_lines.remittance_id
      AND r.organization_id = order_remittance_lines.organization_id
  ));

CREATE POLICY order_remittance_sources_read
  ON public.order_remittance_line_sources FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.order_remittance_lines l
    WHERE l.id = order_remittance_line_sources.line_id
      AND l.organization_id = order_remittance_line_sources.organization_id
  ));

COMMIT;
