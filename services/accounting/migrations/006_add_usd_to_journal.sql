-- Soporte USD en asientos contables
SET search_path TO accounting, public;

ALTER TABLE accounting.journal_entries
  ADD COLUMN IF NOT EXISTS moneda TEXT DEFAULT 'ARS'
    CHECK (moneda IN ('ARS', 'USD'));

ALTER TABLE accounting.journal_entry_lines
  ADD COLUMN IF NOT EXISTS monto_origen  NUMERIC(15,4),
  ADD COLUMN IF NOT EXISTS tipo_cambio   NUMERIC(10,4);

ALTER TABLE accounting.chart_of_accounts
  ADD COLUMN IF NOT EXISTS moneda TEXT DEFAULT 'ARS'
    CHECK (moneda IN ('ARS', 'USD', 'AMBAS'));
