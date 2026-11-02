-- Opt-in policy. No tenant is enabled and no historical debt is changed here.
-- NOTA_DE_VENTA retains operational debt without fiscal authorization.
CREATE OR REPLACE FUNCTION public.organization_uses_invoice_backed_debt(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_settings
    WHERE organization_id = p_org_id
      AND settings->'invoice_backed_debt_enabled' = 'true'::jsonb
  );
$$;

-- Operational callers can still complete dispatch/confirmation when no AR is
-- due: suppress only the INSERT, never delete or zero an existing account.
CREATE OR REPLACE FUNCTION public.gate_invoice_backed_receivable_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.organization_uses_invoice_backed_debt(NEW.organization_id) THEN
    RETURN NEW;
  END IF;
  IF NEW.sales_order_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.sales_orders
      WHERE id = NEW.sales_order_id AND organization_id = NEW.organization_id
        AND (is_historical = true OR invoice_type = 'NOTA_DE_VENTA' OR arca_status = 'authorized')
        AND status <> 'CANCELLED'
    ) THEN
      RETURN NEW;
    END IF;
    RETURN NULL;
  END IF;
  IF NEW.manual_fiscal_invoice_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.manual_fiscal_invoices
    WHERE id = NEW.manual_fiscal_invoice_id
      AND organization_id = NEW.organization_id AND status = 'authorized'
  ) THEN
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS gate_invoice_backed_receivable_insert ON public.accounts_receivable;
CREATE TRIGGER gate_invoice_backed_receivable_insert
  BEFORE INSERT ON public.accounts_receivable
  FOR EACH ROW EXECUTE FUNCTION public.gate_invoice_backed_receivable_insert();

-- The authorization and its AR commit together. Existing ARs (and all their
-- payments/credits) are left untouched. Repeated authorization is idempotent.
-- ADVANCE and BALANCE documents own their own AR; their operational parent does
-- not acquire fiscal debt merely by dispatching. Notes retain their usual debt.
-- Legacy deferral triggers still apply.
CREATE OR REPLACE FUNCTION public.create_invoice_backed_sale_receivable()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.organization_uses_invoice_backed_debt(NEW.organization_id)
    OR NEW.arca_status IS DISTINCT FROM 'authorized'
    OR NEW.status = 'CANCELLED' OR NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.accounts_receivable (
    organization_id, customer_id, sales_order_id, total_amount,
    pending_balance, currency, due_date, status
  )
  SELECT NEW.organization_id, NEW.customer_id, NEW.id, NEW.total_amount,
    NEW.total_amount, coalesce(NEW.currency, 'ARS'),
    coalesce(NEW.expiration_date, NEW.sale_date + NEW.credit_days, NEW.sale_date),
    CASE WHEN NEW.total_amount <= 0 THEN 'PAID'::public.receivable_status
      ELSE 'PENDING'::public.receivable_status END
  WHERE NOT EXISTS (
    SELECT 1 FROM public.accounts_receivable
    WHERE sales_order_id = NEW.id AND organization_id = NEW.organization_id
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_invoice_backed_sale_receivable ON public.sales_orders;
CREATE TRIGGER create_invoice_backed_sale_receivable
  AFTER INSERT OR UPDATE OF arca_status ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.create_invoice_backed_sale_receivable();

-- Enforce the origin even for OCs inserted by orders/RPCs or a stale browser.
CREATE OR REPLACE FUNCTION public.enforce_invoice_backed_purchase_origin()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.organization_uses_invoice_backed_debt(NEW.organization_id) THEN
    NEW.payable_origin := 'SUPPLIER_INVOICE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_invoice_backed_purchase_origin ON public.purchase_orders;
CREATE TRIGGER enforce_invoice_backed_purchase_origin
  BEFORE INSERT OR UPDATE OF payable_origin ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_backed_purchase_origin();

CREATE OR REPLACE FUNCTION public.gate_invoice_backed_payable_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.organization_uses_invoice_backed_debt(NEW.organization_id)
    AND NEW.purchase_order_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.supplier_invoices
      WHERE purchase_order_id = NEW.purchase_order_id
        AND organization_id = NEW.organization_id AND status = 'REGISTERED'
    ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gate_invoice_backed_payable_insert ON public.accounts_payable;
CREATE TRIGGER gate_invoice_backed_payable_insert
  BEFORE INSERT ON public.accounts_payable
  FOR EACH ROW EXECUTE FUNCTION public.gate_invoice_backed_payable_insert();

REVOKE ALL ON FUNCTION public.organization_uses_invoice_backed_debt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.organization_uses_invoice_backed_debt(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.gate_invoice_backed_receivable_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_invoice_backed_sale_receivable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_invoice_backed_purchase_origin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gate_invoice_backed_payable_insert() FROM PUBLIC;

-- Retain the established atomic sale update, only gate its operational AR sync.
CREATE OR REPLACE FUNCTION public.update_sale_order_atomic(
  p_org_id uuid,
  p_sale_id uuid,
  p_customer_id uuid DEFAULT NULL::uuid,
  p_user_id uuid DEFAULT NULL::uuid,
  p_sale_date date DEFAULT NULL::date,
  p_expiration_date date DEFAULT NULL::date,
  p_credit_days integer DEFAULT NULL::integer,
  p_invoice_type invoice_type DEFAULT NULL::invoice_type,
  p_invoice_number text DEFAULT NULL::text,
  p_observations text DEFAULT NULL::text,
  p_global_discount_percentage numeric DEFAULT NULL::numeric,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_taxes jsonb DEFAULT '[]'::jsonb
)
RETURNS sales_orders
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
declare
  v_sale public.sales_orders%rowtype;
  v_updated public.sales_orders%rowtype;
  v_sub_total numeric := 0;
  v_global_discount_pct numeric := 0;
  v_global_discount_amount numeric := 0;
  v_discounted_subtotal numeric := 0;
  v_total_tax_amount numeric := 0;
  v_total_amount numeric := 0;
  v_due_date date;
  v_receivable_id uuid;
  v_prev_total numeric := 0;
  v_prev_pending numeric := 0;
  v_paid_amount numeric := 0;
  v_next_pending numeric := 0;
  v_next_status public.receivable_status := 'PENDING';
begin
  if coalesce(jsonb_typeof(p_items), '') <> 'array' then
    raise exception 'p_items must be a JSON array';
  end if;
  if coalesce(jsonb_typeof(p_taxes), '') <> 'array' then
    raise exception 'p_taxes must be a JSON array';
  end if;
  select * into v_sale from public.sales_orders so
  where so.id = p_sale_id and so.organization_id = p_org_id for update;
  if not found then
    raise exception 'Sale not found (id=%, org=%)', p_sale_id, p_org_id;
  end if;
  delete from public.sales_order_items soi
  where soi.sales_order_id = p_sale_id and soi.organization_id = p_org_id;
  with parsed_items as (
    select nullif(x.id, '') as id_text,
      coalesce(x.type, case when x."productId" is null then 'adjustment' else 'product' end) as item_type,
      x."productId" as product_id, x.description,
      coalesce(x.quantity, 0)::numeric as quantity,
      x."weightQuantity"::numeric as weight_quantity,
      coalesce(x."unitPrice", 0)::numeric as unit_price,
      coalesce(x."basePrice", x."unitPrice", 0)::numeric as base_price,
      least(greatest(coalesce(x."discountPercentage", 0)::numeric, 0), 100) as discount_percentage
    from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(
      id text, type text, "productId" uuid, description text,
      quantity numeric, "weightQuantity" numeric, "unitPrice" numeric,
      "basePrice" numeric, "discountPercentage" numeric
    )
  ), normalized as (
    select coalesce(case when id_text ~* '^[0-9a-f-]{36}$' then id_text::uuid else null end, gen_random_uuid()) as id,
      p_org_id as organization_id, p_sale_id as sales_order_id,
      case when pi.item_type = 'adjustment' then null else pi.product_id end as product_id,
      case when pi.item_type = 'adjustment' then coalesce(pi.description, 'Ajuste manual') else pi.description end as description,
      case when pi.item_type = 'adjustment' then 1 else greatest(pi.quantity, 0) end as quantity,
      case when pi.item_type = 'adjustment' then null
        when coalesce(pr.tracks_stock_units, false) and coalesce(pi.weight_quantity, 0) > 0 then pi.weight_quantity
        else null end as unit_quantity,
      round(greatest(pi.unit_price, 0), 2) as unit_price,
      round(greatest(pi.base_price, 0), 2) as base_price,
      pi.discount_percentage, coalesce(pr.tracks_stock_units, false) as tracks_stock_units
    from parsed_items pi left join public.products pr
      on pr.id = pi.product_id and pr.organization_id = p_org_id
    where (pi.item_type = 'adjustment' and pi.unit_price is not null)
      or (pi.item_type <> 'adjustment' and pi.product_id is not null
        and (pi.quantity > 0 or coalesce(pi.weight_quantity, 0) > 0))
  ), computed as (
    select n.*,
      round(case when n.product_id is null then n.unit_price
        when n.tracks_stock_units and coalesce(n.unit_quantity, 0) > 0 then coalesce(n.unit_quantity, 0) * n.base_price
        else n.quantity * n.unit_price end, 2) as gross,
      round(least(greatest(0,
        (case when n.product_id is null then n.unit_price
          when n.tracks_stock_units and coalesce(n.unit_quantity, 0) > 0 then coalesce(n.unit_quantity, 0) * n.base_price
          else n.quantity * n.unit_price end) * (n.discount_percentage / 100.0)),
        greatest(0, case when n.product_id is null then n.unit_price
          when n.tracks_stock_units and coalesce(n.unit_quantity, 0) > 0 then coalesce(n.unit_quantity, 0) * n.base_price
          else n.quantity * n.unit_price end)), 2) as discount_amount
    from normalized n
  )
  insert into public.sales_order_items (
    id, organization_id, sales_order_id, product_id, description, quantity,
    unit_quantity, unit_price, base_price, discount_percentage, discount_amount, subtotal
  )
  select c.id, c.organization_id, c.sales_order_id, c.product_id, c.description,
    c.quantity, c.unit_quantity, c.unit_price, c.base_price, c.discount_percentage,
    c.discount_amount, round(greatest(0, c.gross - c.discount_amount), 2)
  from computed c;
  select coalesce(round(sum(subtotal), 2), 0) into v_sub_total
  from public.sales_order_items soi
  where soi.sales_order_id = p_sale_id and soi.organization_id = p_org_id;
  v_global_discount_pct := least(greatest(coalesce(p_global_discount_percentage, v_sale.global_discount_percentage, 0), 0), 100);
  v_global_discount_amount := round(least(greatest((v_global_discount_pct / 100.0) * v_sub_total, 0), greatest(v_sub_total, 0)), 2);
  v_discounted_subtotal := round(greatest(0, v_sub_total - v_global_discount_amount), 2);
  delete from public.sales_order_taxes sot
  where sot.sales_order_id = p_sale_id and sot.organization_id = p_org_id;
  insert into public.sales_order_taxes (
    organization_id, sales_order_id, tax_id, name, rate, base_amount, tax_amount
  )
  select p_org_id, p_sale_id, t."taxId", coalesce(t.name, ''), coalesce(t.rate, 0),
    v_discounted_subtotal, round(v_discounted_subtotal * (coalesce(t.rate, 0) / 100.0), 2)
  from jsonb_to_recordset(coalesce(p_taxes, '[]'::jsonb)) as t("taxId" uuid, name text, rate numeric)
  where t."taxId" is not null;
  select coalesce(round(sum(tax_amount), 2), 0) into v_total_tax_amount
  from public.sales_order_taxes sot
  where sot.sales_order_id = p_sale_id and sot.organization_id = p_org_id;
  v_total_amount := round(greatest(0, v_discounted_subtotal + v_total_tax_amount), 2);
  v_due_date := coalesce(p_expiration_date,
    case when coalesce(p_credit_days, v_sale.credit_days) is not null
      then coalesce(p_sale_date, v_sale.sale_date) + coalesce(p_credit_days, v_sale.credit_days)
      else v_sale.expiration_date end);
  update public.sales_orders so set
    customer_id = coalesce(p_customer_id, so.customer_id),
    user_id = coalesce(p_user_id, so.user_id),
    sale_date = coalesce(p_sale_date, so.sale_date),
    credit_days = coalesce(p_credit_days, so.credit_days), expiration_date = v_due_date,
    invoice_type = coalesce(p_invoice_type, so.invoice_type),
    invoice_number = coalesce(p_invoice_number, so.invoice_number),
    observations = coalesce(p_observations, so.observations), sub_total = v_sub_total,
    total_tax_amount = case when v_total_tax_amount = 0 then null else v_total_tax_amount end,
    global_discount_percentage = v_global_discount_pct,
    global_discount_amount = v_global_discount_amount, total_amount = v_total_amount, updated_at = now()
  where so.id = p_sale_id and so.organization_id = p_org_id returning * into v_updated;

  if v_updated.status in ('DISPATCH', 'DELIVERED')
    and (v_updated.invoice_type = 'NOTA_DE_VENTA'
      or not public.organization_uses_invoice_backed_debt(p_org_id)) then
    select ar.id, ar.total_amount, ar.pending_balance
      into v_receivable_id, v_prev_total, v_prev_pending
    from public.accounts_receivable ar
    where ar.sales_order_id = p_sale_id and ar.organization_id = p_org_id for update;
    if found then
      v_paid_amount := round(greatest(0, coalesce(v_prev_total, 0) - coalesce(v_prev_pending, 0)), 2);
      v_next_pending := round(greatest(0, v_total_amount - v_paid_amount), 2);
      if v_next_pending <= 0 then v_next_status := 'PAID';
      elsif v_next_pending < v_total_amount then v_next_status := 'PARTIALLY_PAID';
      else v_next_status := 'PENDING'; end if;
      update public.accounts_receivable ar set
        customer_id = coalesce(p_customer_id, ar.customer_id), total_amount = v_total_amount,
        pending_balance = v_next_pending, due_date = coalesce(v_due_date, ar.due_date),
        status = v_next_status, updated_at = now()
      where ar.id = v_receivable_id;
    elsif p_customer_id is not null then
      insert into public.accounts_receivable (
        organization_id, customer_id, sales_order_id, total_amount, pending_balance, due_date, status
      ) values (p_org_id, p_customer_id, p_sale_id, v_total_amount, v_total_amount,
        coalesce(v_due_date, current_date), 'PENDING');
    end if;
  end if;
  return v_updated;
end;
$function$;
