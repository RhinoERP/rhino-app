-- Permisos granulares del módulo Tesorería.
-- El sidebar actualmente usa "organization.admin"; estos permisos permiten
-- otorgar acceso a roles no-admin en el futuro sin cambios de código.

INSERT INTO permissions (name, description) VALUES
  ('treasury.read',           'Ver cuentas bancarias, movimientos y carteras de cheques'),
  ('treasury.manage',         'Crear y modificar cuentas bancarias, movimientos y boletas'),
  ('treasury.checks.manage',  'Gestionar carteras de cheques recibidos y emitidos')
ON CONFLICT (name) DO NOTHING;
