-- Agrega treasury.read (estaba en la migración original pero con name en vez de key)
-- y pos.returns.manage (referenciado en código pero nunca migrado a BD)
INSERT INTO permissions (key, description) VALUES
  ('treasury.read', 'Ver cuentas bancarias, movimientos y carteras de cheques'),
  ('pos.returns.manage', 'Gestionar las devoluciones de venta directa')
ON CONFLICT (key) DO NOTHING;
