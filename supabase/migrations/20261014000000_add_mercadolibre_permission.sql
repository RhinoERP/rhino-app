INSERT INTO public.permissions (key, description)
VALUES (
  'mercadolibre.access',
  'Permite consultar venta directa y productos con SKU iniciado por MELI-'
)
ON CONFLICT (key) DO NOTHING;
