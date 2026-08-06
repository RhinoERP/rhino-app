-- Agrega permisos de gestión (manage) para todos los módulos que no los tenían
INSERT INTO permissions (key, description) VALUES
  ('purchases.manage', 'Crear, editar y recibir compras'),
  ('suppliers.manage', 'Crear y editar proveedores'),
  ('customers.manage', 'Crear y editar clientes'),
  ('finances.manage', 'Gestionar gastos, categorías y movimientos financieros'),
  ('creditnotes.manage', 'Crear y gestionar notas de crédito'),
  ('pos.manage', 'Gestionar ventas directas, sesiones y terminales POS'),
  ('quotes.manage', 'Crear, editar y gestionar presupuestos'),
  ('orders.manage', 'Gestionar transiciones de estado, cancelaciones y remitos de pedidos'),
  ('treasury.manage', 'Gestionar movimientos de tesorería, cuentas bancarias y cheques')
ON CONFLICT (key) DO NOTHING;
