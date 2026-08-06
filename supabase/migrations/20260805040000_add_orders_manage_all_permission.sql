-- Agrega variante manage.all para pedidos
INSERT INTO permissions (key, description) VALUES
  ('orders.manage.all', 'Gestionar todos los pedidos de la organización')
ON CONFLICT (key) DO NOTHING;
