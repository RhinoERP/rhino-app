-- Los roles "admin" se crean con una foto de todos los permisos existentes en
-- ese momento. Los permisos agregados después por migraciones nunca se les
-- asignaron, dejando a los administradores sin permisos nuevos (p. ej. las
-- columnas de costo/margen/proveedor).
--
-- 1) Backfill: asigna a los roles admin todos los permisos faltantes.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.key = 'admin'
  AND NOT EXISTS (
    SELECT 1
    FROM public.role_permissions rp
    WHERE rp.role_id = r.id
      AND rp.permission_id = p.id
  );

-- 2) Trigger: todo permiso nuevo creado a futuro se asigna automáticamente
--    a los roles admin de todas las organizaciones.
CREATE OR REPLACE FUNCTION public.grant_new_permission_to_admin_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT r.id, NEW.id
  FROM public.roles r
  WHERE r.key = 'admin'
    AND NOT EXISTS (
      SELECT 1
      FROM public.role_permissions rp
      WHERE rp.role_id = r.id
        AND rp.permission_id = NEW.id
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grant_new_permission_to_admin_roles_trigger
  ON public.permissions;
CREATE TRIGGER grant_new_permission_to_admin_roles_trigger
  AFTER INSERT ON public.permissions
  FOR EACH ROW EXECUTE FUNCTION public.grant_new_permission_to_admin_roles();

-- 3) Backfill rol vendedor: la seed pedía la clave legacy "clients.read" que
--    no existe; la clave actual es "customers.read".
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key = 'customers.read'
WHERE r.key = 'vendedor'
  AND NOT EXISTS (
    SELECT 1
    FROM public.role_permissions rp
    WHERE rp.role_id = r.id
      AND rp.permission_id = p.id
  );
