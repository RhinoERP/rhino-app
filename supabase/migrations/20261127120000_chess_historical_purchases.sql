-- Read-only import surface: no operational purchases, payables or stock triggers.
CREATE FUNCTION public.can_read_chess_purchase_history(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    JOIN public.organizations o ON o.id = m.organization_id AND o.is_active
    LEFT JOIN public.roles r ON r.id = m.role_id AND r.organization_id = m.organization_id
    LEFT JOIN public.role_permissions rp ON rp.role_id = r.id
    LEFT JOIN public.permissions p ON p.id = rp.permission_id
    WHERE m.organization_id = p_org AND m.user_id = auth.uid() AND m.is_active
      AND (m.is_owner OR p.key IN ('organization.admin','purchases.read.all','purchases.manage.all'))
  );
$$;
REVOKE ALL ON FUNCTION public.can_read_chess_purchase_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_chess_purchase_history(uuid) TO authenticated, service_role;

CREATE TABLE public.historical_purchase_documents (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  source_key text NOT NULL,
  company_code text NOT NULL,
  branch_code text NOT NULL,
  document_code text NOT NULL CHECK (document_code IN ('FC','NC','ND','ME','MI')),
  document_letter text NOT NULL,
  document_series integer NOT NULL,
  document_number bigint NOT NULL,
  printed_number text NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_chess_code text NOT NULL,
  supplier_name text NOT NULL,
  document_date date NOT NULL,
  tax_date date,
  debt_sign smallint NOT NULL CHECK (debt_sign IN (-1,1)),
  purchase_sign smallint NOT NULL CHECK (purchase_sign IN (-1,0,1)),
  is_fiscal boolean NOT NULL,
  is_mipyme boolean NOT NULL,
  currency text NOT NULL,
  exchange_rate numeric NOT NULL CHECK (exchange_rate > 0),
  gross_amount numeric NOT NULL,
  discount_amount numeric NOT NULL,
  non_taxable_amount numeric NOT NULL,
  net_taxable_amount numeric NOT NULL,
  vat_amount numeric NOT NULL,
  internal_tax_amount numeric NOT NULL,
  perception_iibb_amount numeric NOT NULL,
  perception_3337_amount numeric NOT NULL,
  perception_5329_amount numeric NOT NULL,
  municipal_tax_amount numeric NOT NULL,
  total_amount numeric NOT NULL,
  payment_methods text[] NOT NULL DEFAULT '{}',
  payment_order_references text[] NOT NULL DEFAULT '{}',
  source_file_sha256 text NOT NULL,
  source_sheet text NOT NULL,
  UNIQUE (organization_id, source_key),
  UNIQUE (id, organization_id),
  CHECK (debt_sign = CASE WHEN document_code IN ('NC','MI') THEN -1 ELSE 1 END),
  CHECK (purchase_sign = CASE WHEN document_code = 'MI' THEN 0 WHEN document_code = 'NC' THEN -1 ELSE 1 END)
);
CREATE INDEX historical_purchases_org_date ON public.historical_purchase_documents(organization_id,document_date DESC,id);
CREATE INDEX historical_purchases_org_supplier ON public.historical_purchase_documents(organization_id,supplier_chess_code);

CREATE TABLE public.historical_purchase_document_items (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  historical_document_id uuid NOT NULL,
  source_row integer NOT NULL,
  row_kind text NOT NULL CHECK (row_kind IN ('ARTICLE','ACCOUNTING')),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_chess_code text,
  description text NOT NULL,
  concept text NOT NULL,
  boxes numeric NOT NULL,
  units numeric NOT NULL,
  units_per_box numeric,
  base_unit_quantity numeric,
  unit_price numeric NOT NULL,
  discount_percentage numeric NOT NULL,
  net_amount numeric NOT NULL,
  vat_rate numeric NOT NULL,
  vat_amount numeric NOT NULL,
  subtotal numeric NOT NULL,
  cost_center text NOT NULL,
  expense text NOT NULL,
  category text NOT NULL,
  raw_data jsonb NOT NULL,
  FOREIGN KEY (historical_document_id,organization_id)
    REFERENCES public.historical_purchase_documents(id,organization_id) ON DELETE CASCADE,
  UNIQUE (historical_document_id,source_row)
);
CREATE INDEX historical_purchase_items_document ON public.historical_purchase_document_items(organization_id,historical_document_id);

ALTER TABLE public.historical_purchase_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historical_purchase_document_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY historical_purchases_read ON public.historical_purchase_documents FOR SELECT TO authenticated
  USING (public.can_read_chess_purchase_history(organization_id));
CREATE POLICY historical_purchase_items_read ON public.historical_purchase_document_items FOR SELECT TO authenticated
  USING (public.can_read_chess_purchase_history(organization_id));
REVOKE ALL ON public.historical_purchase_documents,public.historical_purchase_document_items FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.historical_purchase_documents,public.historical_purchase_document_items TO authenticated;
GRANT ALL ON public.historical_purchase_documents,public.historical_purchase_document_items TO service_role;

COMMENT ON TABLE public.historical_purchase_documents IS 'Excel CHESS: archival vouchers, no operational side effects. MI excluded from net purchases.';
