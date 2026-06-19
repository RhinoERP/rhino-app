import type {
  ColumnType,
  Generated,
  Insertable,
  Selectable,
  Updateable,
} from "kysely";

// ------------------------------------------------------------
// chart_of_accounts
// ------------------------------------------------------------
export type ChartOfAccountsTable = {
  id: Generated<string>;
  org_id: string;
  codigo: string;
  nombre: string;
  account_code: string | null;
  tipo: "ACTIVO" | "PASIVO" | "PN" | "INGRESO" | "EGRESO";
  naturaleza: "DEUDORA" | "ACREEDORA";
  permite_movimientos: Generated<boolean>;
  activa: Generated<boolean>;
  padre_id: string | null;
  creado_at: ColumnType<Date, never, never>;
  moneda: Generated<"ARS" | "USD" | "AMBAS">;
};

export type ChartOfAccount = Selectable<ChartOfAccountsTable>;
export type NewChartOfAccount = Insertable<ChartOfAccountsTable>;
export type UpdateChartOfAccount = Updateable<ChartOfAccountsTable>;

// ------------------------------------------------------------
// accounting_rules
// ------------------------------------------------------------
export type AccountingRulesTable = {
  id: Generated<string>;
  org_id: string;
  tipo_evento: string;
  condicion: unknown | null; // JSONB — null = catch-all
  activa: Generated<boolean>;
  es_fija: Generated<boolean>;
  descripcion: string | null;
  prioridad: Generated<number>;
};

export type AccountingRule = Selectable<AccountingRulesTable>;
export type NewAccountingRule = Insertable<AccountingRulesTable>;

// ------------------------------------------------------------
// accounting_rule_lines
// ------------------------------------------------------------
export type AccountingRuleLinesTable = {
  id: Generated<string>;
  rule_id: string;
  account_code: string | null;
  lado: "DEBE" | "HABER";
  formula: string;
  es_seleccionable: Generated<boolean>;
  opciones_cuenta: unknown | null; // JSONB: [{ accountCode, label }]
};

export type AccountingRuleLine = Selectable<AccountingRuleLinesTable>;
export type NewAccountingRuleLine = Insertable<AccountingRuleLinesTable>;

// ------------------------------------------------------------
// journal_entries
// ------------------------------------------------------------
export type JournalEntriesTable = {
  id: Generated<string>;
  org_id: string;
  numero: Generated<number>; // BIGINT — pg devuelve string para BIGINT; cast en queries
  fecha: ColumnType<Date, string, string>;
  descripcion: string | null;
  tipo_evento: string | null;
  referencia_id: string | null;
  referencia_tabla: string | null;
  estado: Generated<"ACTIVO" | "ANULADO">;
  estado_imputacion: Generated<"COMPLETO" | "SUSPENSO">;
  idempotency_key: string;
  creado_por: string | null;
  creado_at: ColumnType<Date, never, never>;
  anulado_por_id: string | null;
};

export type JournalEntry = Selectable<JournalEntriesTable>;
export type NewJournalEntry = Insertable<JournalEntriesTable>;

// ------------------------------------------------------------
// journal_entry_lines
// ------------------------------------------------------------
export type JournalEntryLinesTable = {
  id: Generated<string>;
  journal_entry_id: string;
  cuenta_id: string | null;
  debe: ColumnType<string, string, string>; // NUMERIC → string en pg
  haber: ColumnType<string, string, string>;
  descripcion: string | null;
  pendiente_imputacion: Generated<boolean>;
};

export type JournalEntryLine = Selectable<JournalEntryLinesTable>;
export type NewJournalEntryLine = Insertable<JournalEntryLinesTable>;

// ------------------------------------------------------------
// accounting_pending_events
// ------------------------------------------------------------
export type AccountingPendingEventsTable = {
  id: Generated<string>;
  org_id: string;
  tipo_evento: string;
  referencia_id: string;
  referencia_tabla: string;
  payload: unknown; // JSONB
  estado: Generated<"PENDIENTE" | "PROCESADO" | "ERROR">;
  intentos: Generated<number>;
  ultimo_error: string | null;
  idempotency_key: string;
  creado_at: ColumnType<Date, never, never>;
  procesado_at: Date | null;
};

export type AccountingPendingEvent = Selectable<AccountingPendingEventsTable>;
export type NewAccountingPendingEvent =
  Insertable<AccountingPendingEventsTable>;

// ------------------------------------------------------------
// Database interface — Kysely usa estas keys para tipado de queries
// Las keys son schema-qualified para queries sin search_path
// ------------------------------------------------------------
export type Database = {
  "accounting.chart_of_accounts": ChartOfAccountsTable;
  "accounting.accounting_rules": AccountingRulesTable;
  "accounting.accounting_rule_lines": AccountingRuleLinesTable;
  "accounting.journal_entries": JournalEntriesTable;
  "accounting.journal_entry_lines": JournalEntryLinesTable;
  "accounting.accounting_pending_events": AccountingPendingEventsTable;
};
