-- Multimoneda: import_price_list ahora guarda la moneda por ítem
-- (price_list_items.currency), leída de la columna "Moneda" de la planilla
-- (campo `currency` de cada elemento de p_items). Si el ítem no trae moneda o
-- viene vacío, se asume 'ARS' (organizaciones sin multimoneda no se ven
-- obligadas a cargarla).
CREATE OR REPLACE FUNCTION public.import_price_list(
  p_organization_id uuid,
  p_supplier_id uuid,
  p_name text,
  p_valid_from date,
  p_items jsonb,
  p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_price_list_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_imported_count INTEGER := 0;
    v_missing_skus TEXT[] := ARRAY[]::TEXT[];
    v_is_active BOOLEAN;
    v_result JSONB;
BEGIN
    -- Determine if the list is active (The View needs this flag to work)
    v_is_active := (p_valid_from <= CURRENT_DATE);

    -- 1. Create the price list header
    INSERT INTO public.price_lists (
        organization_id,
        supplier_id,
        name,
        valid_from,
        notes,
        is_active
    )
    VALUES (
        p_organization_id,
        p_supplier_id,
        p_name,
        p_valid_from,
        p_notes,
        v_is_active
    )
    RETURNING id INTO v_price_list_id;

    -- 2. Loop through items and save them to the database
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- Find product ID based on SKU
        SELECT id INTO v_product_id
        FROM public.products
        WHERE sku = v_item->>'sku'
            AND organization_id = p_organization_id
        LIMIT 1;

        IF v_product_id IS NULL THEN
            -- Track missing SKUs
            v_missing_skus := array_append(v_missing_skus, v_item->>'sku');
        ELSE
            -- Insert the item (profit_margin removed - it's only in products table now)
            INSERT INTO public.price_list_items (
                price_list_id,
                product_id,
                cost_price,
                currency
            )
            VALUES (
                v_price_list_id,
                v_product_id,
                (v_item->>'price')::NUMERIC,
                COALESCE(NULLIF(v_item->>'currency', ''), 'ARS')
            );

            v_imported_count := v_imported_count + 1;
        END IF;
    END LOOP;

    -- 3. Return results
    v_result := jsonb_build_object(
        'price_list_id', v_price_list_id,
        'imported_count', v_imported_count,
        'missing_skus', to_jsonb(v_missing_skus),
        'is_active', v_is_active
    );

    RETURN v_result;
END;
$function$;
