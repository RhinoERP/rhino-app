-- ============================================================
-- 001_create_schema.sql
-- Crear schema contable aislado dentro de la instancia Supabase
--
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- o via: psql "<DIRECT_CONNECTION_URL>" -f migrations/001_create_schema.sql
-- ============================================================

CREATE SCHEMA IF NOT EXISTS accounting;

-- Otorgar permisos al rol que usa el servicio Express (conexión directa)
GRANT USAGE ON SCHEMA accounting TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA accounting TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA accounting TO postgres;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA accounting TO postgres;

-- Asegurar que los objetos creados en el futuro también tengan permisos
ALTER DEFAULT PRIVILEGES IN SCHEMA accounting
  GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA accounting
  GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA accounting
  GRANT ALL ON FUNCTIONS TO postgres;

-- Verificar que el schema fue creado
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'accounting';
