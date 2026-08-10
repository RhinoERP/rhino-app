-- Agrega permisos para el módulo de comisiones
INSERT INTO permissions (key, description) VALUES
  ('commissions.read', 'Ver comisiones de vendedores')
ON CONFLICT (key) DO NOTHING;
