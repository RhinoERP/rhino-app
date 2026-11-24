-- IA Comercial · Reportes programados por WhatsApp.
-- Cada reporte guardado puede llegarle a su dueño por WhatsApp todos los días,
-- un día de la semana o una vez por mes, a la hora que elija.
-- Se puede correr más de una vez sin error.

ALTER TABLE public.commercial_ai_saved_reports
  -- { frequency: 'diario'|'semanal'|'mensual', weekday: 0-6 (0 = domingo),
  --   monthday: 1-28, hour: 0-23 (hora argentina), active: bool }
  ADD COLUMN IF NOT EXISTS whatsapp_schedule jsonb,
  ADD COLUMN IF NOT EXISTS whatsapp_last_sent_at timestamptz,
  -- Fuera de las 24 h de WhatsApp se manda una plantilla con el botón
  -- "Ver reporte"; el texto queda acá hasta que lo toca.
  ADD COLUMN IF NOT EXISTS whatsapp_pending_text text,
  ADD COLUMN IF NOT EXISTS whatsapp_pending_at timestamptz;

CREATE INDEX IF NOT EXISTS commercial_ai_saved_reports_whatsapp_idx
  ON public.commercial_ai_saved_reports (organization_id)
  WHERE whatsapp_schedule IS NOT NULL;

-- El envío corre con la clave de servicio: necesita leer los permisos del
-- dueño del reporte para respetar lo que puede ver.
GRANT SELECT ON
  public.organizations,
  public.organization_members,
  public.roles,
  public.role_permissions,
  public.permissions
TO service_role;
