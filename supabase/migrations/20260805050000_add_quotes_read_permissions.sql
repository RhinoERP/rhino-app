-- Agrega permisos de lectura para presupuestos (propios/todos)
INSERT INTO permissions (key, description) VALUES
  ('quotes.read', 'Ver presupuestos propios'),
  ('quotes.read.all', 'Ver todos los presupuestos de la organización'),
  ('quotes.manage.all', 'Gestionar todos los presupuestos de la organización')
ON CONFLICT (key) DO NOTHING;
