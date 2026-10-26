-- Preserve quote-origin extras when an edited sale replaces its items.
-- Wrap the existing atomic update so the items, extras, totals and receivable
-- are all changed in the same database transaction.
CREATE OR REPLACE FUNCTION public.update_sale_order_with_extras_atomic(
  p_org_id uuid,
  p_sale_id uuid,
  p_customer_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_sale_date date DEFAULT NULL,
  p_expiration_date date DEFAULT NULL,
  p_credit_days integer DEFAULT NULL,
  p_invoice_type invoice_type DEFAULT NULL,
  p_invoice_number text DEFAULT NULL,
  p_observations text DEFAULT NULL,
  p_global_discount_percentage numeric DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_taxes jsonb DEFAULT '[]'::jsonb
)
RETURNS public.sales_orders
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_original jsonb;
  v_sale public.sales_orders%rowtype;
  v_item record;
  v_extra record;
  v_gross numeric;
  v_subtotal numeric;
  v_discount numeric;
  v_tax numeric;
  v_total numeric;
  v_paid numeric;
  v_extra_adjustment numeric := 0;
BEGIN
  PERFORM 1 FROM public.sales_orders
  WHERE id = p_sale_id AND organization_id = p_org_id FOR UPDATE;

  -- The original RPC locks the sale and deletes/reinserts all its items.
  -- Capture extras first, then restore only those belonging to the same item.
  SELECT coalesce(jsonb_object_agg(soi.id::text, jsonb_build_object(
    'quoteItemId', soi.quote_item_id,
    'extras', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'name', x.name_snapshot, 'price', x.price_snapshot,
      'cost', x.cost_snapshot, 'type', x.type_snapshot,
      'productExtraId', x.product_extra_id
    )) FROM public.sales_order_item_extras x WHERE x.sales_order_item_id = soi.id), '[]'::jsonb)
  )), '{}'::jsonb) INTO v_original
  FROM public.sales_order_items soi
  WHERE soi.sales_order_id = p_sale_id AND soi.organization_id = p_org_id;

  v_sale := public.update_sale_order_atomic(
    p_org_id, p_sale_id, p_customer_id, p_user_id, p_sale_date,
    p_expiration_date, p_credit_days, p_invoice_type, p_invoice_number,
    p_observations, p_global_discount_percentage, p_items, p_taxes
  );

  FOR v_item IN
    SELECT soi.id, soi.quantity, soi.unit_price, soi.base_price,
      soi.unit_quantity, soi.product_id, soi.discount_percentage,
      soi.subtotal, v_original -> soi.id::text AS original
    FROM public.sales_order_items soi
    WHERE soi.sales_order_id = p_sale_id AND soi.organization_id = p_org_id
  LOOP
    IF v_item.original IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.sales_order_items
    SET quote_item_id = (v_item.original ->> 'quoteItemId')::uuid
    WHERE id = v_item.id;

    FOR v_extra IN SELECT * FROM jsonb_array_elements(v_item.original -> 'extras') AS x(value)
    LOOP
      INSERT INTO public.sales_order_item_extras (
        sales_order_item_id, name_snapshot, price_snapshot,
        cost_snapshot, type_snapshot, product_extra_id
      ) VALUES (
        v_item.id, v_extra.value ->> 'name', (v_extra.value ->> 'price')::numeric,
        (v_extra.value ->> 'cost')::numeric, v_extra.value ->> 'type',
        (v_extra.value ->> 'productExtraId')::uuid
      );
    END LOOP;

    SELECT coalesce(sum(price_snapshot), 0) INTO v_subtotal
    FROM public.sales_order_item_extras WHERE sales_order_item_id = v_item.id;

    IF v_subtotal <> 0 THEN
      -- Item subtotals in quote-origin sales represent the product alone.
      -- Keep that convention; include extras in the sale header and tax base.
      v_gross := CASE WHEN v_item.product_id IS NULL THEN v_item.unit_price
        WHEN v_item.unit_quantity IS NOT NULL THEN v_item.unit_quantity * v_item.base_price
        ELSE v_item.quantity * v_item.unit_price END;
      v_gross := v_gross + v_item.quantity * v_subtotal;
      v_discount := round(v_gross * v_item.discount_percentage / 100.0, 2);
      v_extra_adjustment := v_extra_adjustment +
        round(greatest(0, v_gross - v_discount), 2) - v_item.subtotal;
    END IF;
  END LOOP;

  SELECT coalesce(sum(subtotal), 0) INTO v_subtotal
  FROM public.sales_order_items
  WHERE sales_order_id = p_sale_id AND organization_id = p_org_id;
  v_subtotal := v_subtotal + v_extra_adjustment;
  v_discount := round(v_subtotal * coalesce(v_sale.global_discount_percentage, 0) / 100.0, 2);

  UPDATE public.sales_order_taxes
  SET base_amount = greatest(0, v_subtotal - v_discount),
      tax_amount = round(greatest(0, v_subtotal - v_discount) * rate / 100.0, 2)
  WHERE sales_order_id = p_sale_id AND organization_id = p_org_id;

  SELECT coalesce(sum(tax_amount), 0) INTO v_tax
  FROM public.sales_order_taxes
  WHERE sales_order_id = p_sale_id AND organization_id = p_org_id;
  v_total := round(greatest(0, v_subtotal - v_discount + v_tax), 2);

  UPDATE public.sales_orders
  SET sub_total = v_subtotal, global_discount_amount = v_discount,
      total_tax_amount = CASE WHEN v_tax = 0 THEN NULL ELSE v_tax END,
      total_amount = v_total
  WHERE id = p_sale_id AND organization_id = p_org_id
  RETURNING * INTO v_sale;

  IF v_sale.status IN ('DISPATCH', 'DELIVERED') THEN
    SELECT greatest(0, total_amount - pending_balance) INTO v_paid
    FROM public.accounts_receivable
    WHERE sales_order_id = p_sale_id AND organization_id = p_org_id
    FOR UPDATE;
    IF FOUND THEN
      UPDATE public.accounts_receivable
      SET total_amount = v_total,
          pending_balance = greatest(0, v_total - v_paid),
          status = CASE WHEN v_total <= v_paid THEN 'PAID'::public.receivable_status
            WHEN v_paid > 0 THEN 'PARTIALLY_PAID'::public.receivable_status
            ELSE 'PENDING'::public.receivable_status END,
          updated_at = now()
      WHERE sales_order_id = p_sale_id AND organization_id = p_org_id;
    END IF;
  END IF;

  RETURN v_sale;
END;
$function$;
