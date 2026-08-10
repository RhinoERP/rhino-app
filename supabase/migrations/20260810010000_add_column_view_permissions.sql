-- Permisos para visibilidad de columnas en grillas
INSERT INTO permissions (key, description) VALUES
  ('columns.view_supplier', 'Ver columna Proveedor en la grilla de Productos y Stock'),
  ('columns.view_cost', 'Ver columna Precio de Compra en las grillas de precios'),
  ('columns.view_margin', 'Ver columna Margen (%) en las grillas de precios')
ON CONFLICT (key) DO NOTHING;
