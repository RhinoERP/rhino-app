-- Separates fiscal issuance from organization administration. The existing
-- admin-role trigger automatically grants it to every administrator.
INSERT INTO public.permissions (key, description)
VALUES (
  'arca.issue',
  'Emitir comprobantes fiscales en ARCA sin administrar su configuración'
)
ON CONFLICT (key) DO NOTHING;
