-- ============================================================
-- 015_add_tipo_to_checks.sql
-- Agrega columna `tipo` a las carteras de cheques para distinguir
-- cheques diferidos físicos (CDF) de echeqs (ECH).
-- ============================================================

SET search_path TO accounting, public;

ALTER TABLE accounting.received_checks
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'CDF'
    CHECK (tipo IN ('CDF', 'ECH'));

ALTER TABLE accounting.issued_checks
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'CDF'
    CHECK (tipo IN ('CDF', 'ECH'));
