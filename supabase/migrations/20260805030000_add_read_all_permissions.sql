-- Agrega variantes read.all para que todos los módulos tengan opción Ver propias / Ver todas
INSERT INTO permissions (key, description) VALUES
  ('inventory.read.all', 'Ver todos los productos y stock de la organización'),
  ('purchases.read.all', 'Ver todas las compras de la organización'),
  ('suppliers.read.all', 'Ver todos los proveedores de la organización'),
  ('customers.read.all', 'Ver todos los clientes de la organización'),
  ('finances.read.all', 'Ver todas las finanzas de la organización'),
  ('creditnotes.read.all', 'Ver todas las notas de crédito de la organización'),
  ('pos.read.all', 'Ver todas las ventas directas de la organización'),
  ('orders.read.all', 'Ver todos los pedidos de la organización')
ON CONFLICT (key) DO NOTHING;
