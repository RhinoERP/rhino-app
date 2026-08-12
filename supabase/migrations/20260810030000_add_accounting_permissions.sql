-- Permisos para el módulo de contabilidad
INSERT INTO permissions (key, description) VALUES
  ('accounting.read', 'Ver libros contables y asientos de la organización'),
  ('accounting.manage', 'Gestionar plan de cuentas y asientos contables')
ON CONFLICT (key) DO NOTHING;
