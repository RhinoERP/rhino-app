-- Agrega permiso de gestión de inventario (crear, editar, ajustar stock)
INSERT INTO permissions (key, description) VALUES
  ('inventory.manage', 'Crear, editar y eliminar productos, y ajustar stock')
ON CONFLICT (key) DO NOTHING;
