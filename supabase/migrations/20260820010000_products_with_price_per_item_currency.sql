-- Multimoneda: la moneda del precio efectivo pasa a resolverse POR ÍTEM
-- (price_list_items.currency), en vez de por lista. La columna currency de la
-- view toma la moneda del ítem de la lista vigente; si no está definida, cae a
-- la moneda de la lista y, por último, a ARS.
CREATE OR REPLACE VIEW public.products_with_price AS
SELECT
  p.id,
  p.organization_id,
  p.sku,
  p.name,
  p.description,
  p.category_id,
  p.brand,
  p.unit_of_measure,
  p.weight_per_unit,
  p.units_per_box,
  p.boxes_per_pallet,
  p.sanitary_registration,
  p.image_url,
  p.is_active,
  p.created_at,
  p.updated_at,
  p.supplier_id,
  p.profit_margin,
  pli.cost_price,
  CASE
    WHEN pli.cost_price IS NOT NULL AND p.profit_margin IS NOT NULL
      THEN round(pli.cost_price * (1::numeric + p.profit_margin / 100::numeric), 2)
    ELSE p.sale_price
  END AS calculated_sale_price,
  pl.id AS active_price_list_id,
  pl.name AS active_price_list_name,
  pl.valid_from AS active_price_list_valid_from,
  COALESCE(pli.currency, pl.currency, 'ARS') AS currency
FROM products p
  LEFT JOIN LATERAL (
    SELECT pli_1.cost_price, pli_1.price_list_id, pli_1.currency
    FROM price_list_items pli_1
      JOIN price_lists pl_1 ON pli_1.price_list_id = pl_1.id
    WHERE pli_1.product_id = p.id
      AND pl_1.organization_id = p.organization_id
      AND pl_1.valid_from <= CURRENT_DATE
    ORDER BY pl_1.valid_from DESC
    LIMIT 1
  ) pli ON true
  LEFT JOIN price_lists pl ON pli.price_list_id = pl.id;
