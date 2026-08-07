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
  cuenta_id: string;
  debe: ColumnType<string, string, string>; // NUMERIC → string en pg
  haber: ColumnType<string, string, string>;
  descripcion: string | null;
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
// informal_entries
// ------------------------------------------------------------
export type InformalEntriesTable = {
  id: Generated<string>;
  org_id: string;
  fecha: ColumnType<Date, string, string>;
  descripcion: string | null;
  tipo_evento: string | null;
  referencia_id: string | null;
  referencia_tabla: string | null;
  estado: Generated<"ACTIVO" | "ANULADO">;
  idempotency_key: string;
  creado_por: string | null;
  creado_at: ColumnType<Date, never, never>;
  source_type:
    | "NOTA_DE_VENTA"
    | "FACTURA_PENDIENTE"
    | "COBRO"
    | "ORDEN_PAGO"
    | "COMPRA"
    | "NOTA_DE_CREDITO";
  estado_formalizacion: Generated<"PENDIENTE" | "CANCELADO" | "ASENTADO">;
  formalized_journal_entry_id: string | null;
};

export type InformalEntry = Selectable<InformalEntriesTable>;
export type NewInformalEntry = Insertable<InformalEntriesTable>;

// ------------------------------------------------------------
// informal_entry_lines
// ------------------------------------------------------------
export type InformalEntryLinesTable = {
  id: Generated<string>;
  informal_entry_id: string;
  cuenta_id: string;
  debe: ColumnType<string, string, string>;
  haber: ColumnType<string, string, string>;
  descripcion: string | null;
};

export type InformalEntryLine = Selectable<InformalEntryLinesTable>;
export type NewInformalEntryLine = Insertable<InformalEntryLinesTable>;

export type TreasuryOperationType =
  | "BANK_MOVEMENT_CREATE"
  | "RECEIVED_CHECK_CREATE"
  | "RECEIVED_CHECK_REJECT"
  | "RECEIVED_CHECK_ENDORSEMENT"
  | "ISSUED_CHECK_CREATE"
  | "ISSUED_CHECK_DEBIT"
  | "ISSUED_CHECK_REJECT"
  | "CHECK_DEPOSIT_SLIP_CREATE"
  | "CASH_DEPOSIT_SLIP_CREATE";

export type TreasuryOperationsTable = {
  id: Generated<string>;
  org_id: string;
  operation_key: string;
  operation_type: TreasuryOperationType;
  request_hash: string;
  result_table: string | null;
  result_id: string | null;
  journal_entry_id: string | null;
  movement_id: string | null;
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, never>;
};

export type TreasuryOperation = Selectable<TreasuryOperationsTable>;
export type NewTreasuryOperation = Insertable<TreasuryOperationsTable>;
export type UpdateTreasuryOperation = Updateable<TreasuryOperationsTable>;

// ── Treasury Module ──────────────────────────────────────────────────────────

export type TreasuryBankAccountsTable = {
  id: Generated<string>;
  org_id: string;
  nombre: string;
  banco: string;
  numero_cuenta: string | null;
  alias: string | null;
  moneda: Generated<"ARS" | "USD">;
  saldo_operativo: ColumnType<string, string | undefined, string>; // NUMERIC(15,4), default 0
  activa: Generated<boolean>;
  cuenta_contable_id: string;
  descripcion: string | null;
  creado_at: ColumnType<Date, never, never>;
  actualizado_at: ColumnType<Date, never, never>;
};

export type TreasuryBankAccount = Selectable<TreasuryBankAccountsTable>;
export type NewTreasuryBankAccount = Insertable<TreasuryBankAccountsTable>;
export type UpdateTreasuryBankAccount = Updateable<TreasuryBankAccountsTable>;

export type TreasuryMovementTipo =
  | "DEBITO_BANCARIO"
  | "CREDITO_BANCARIO"
  | "CHEQUE_RECIBIDO_RECHAZADO"
  | "CHEQUE_PROPIO_RECHAZADO"
  | "DEPOSITO_CHEQUES"
  | "DEPOSITO_EFECTIVO"
  | "DEBITO_CHEQUE_PROPIO";

export type TreasuryMovementsTable = {
  id: Generated<string>;
  org_id: string;
  operation_id: string;
  cuenta_bancaria_id: string;
  tipo: TreasuryMovementTipo;
  fecha: ColumnType<Date, string, string>;
  descripcion: string;
  importe: ColumnType<string, string, string>; // NUMERIC(15,4)
  lado: "DEBE" | "HABER";
  journal_entry_id: string | null;
  referencia_id: string | null;
  referencia_tabla: string | null;
  estado: Generated<"ACTIVO" | "ANULADO">;
  creado_por: string | null;
  creado_at: ColumnType<Date, never, never>;
};

export type TreasuryMovement = Selectable<TreasuryMovementsTable>;
export type NewTreasuryMovement = Insertable<TreasuryMovementsTable>;

export type ReceivedCheckEstado =
  | "EN_CARTERA"
  | "DEPOSITADO"
  | "ENDOSADO"
  | "RECHAZADO"
  | "ANULADO";

export type ReceivedChecksTable = {
  id: Generated<string>;
  org_id: string;
  operation_id: string;
  numero_cheque: string;
  banco_emisor: string;
  importe: ColumnType<string, string, string>; // NUMERIC(15,4)
  fecha_emision: ColumnType<Date, string, string>;
  fecha_vencimiento: ColumnType<Date, string, string>;
  librador: string | null;
  librador_id: string | null;
  notas: string | null;
  tipo: Generated<"CDF" | "ECH">;
  estado: Generated<ReceivedCheckEstado>;
  deposit_slip_id: string | null;
  journal_entry_id: string | null;
  creado_por: string | null;
  creado_at: ColumnType<Date, never, never>;
  actualizado_at: ColumnType<Date, never, never>;
};

export type ReceivedCheck = Selectable<ReceivedChecksTable>;
export type NewReceivedCheck = Insertable<ReceivedChecksTable>;
export type UpdateReceivedCheck = Updateable<ReceivedChecksTable>;

export type ReceivedCheckEndorsementsTable = {
  id: Generated<string>;
  org_id: string;
  received_check_id: string;
  payable_payment_id: string;
  account_payable_id: string;
  supplier_id: string;
  operation_id: string;
  endorsement_date: ColumnType<Date, string, string>;
  amount_snapshot: ColumnType<string, string, string>;
  created_by: string | null;
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, never>;
};

export type ReceivedCheckEndorsement =
  Selectable<ReceivedCheckEndorsementsTable>;
export type NewReceivedCheckEndorsement =
  Insertable<ReceivedCheckEndorsementsTable>;

export type PublicAccountsPayableTable = {
  id: Generated<string>;
  organization_id: string;
  supplier_id: string;
  purchase_order_id: string;
  total_amount: ColumnType<string, string, string>;
  pending_balance: ColumnType<string, string, string>;
  due_date: ColumnType<Date, string, string>;
  status: string;
  created_at: ColumnType<Date | null, string | null | undefined, string | null>;
};

export type PublicAccountsPayable = Selectable<PublicAccountsPayableTable>;
export type UpdatePublicAccountsPayable =
  Updateable<PublicAccountsPayableTable>;

export type PublicPayablePaymentsTable = {
  id: Generated<string>;
  organization_id: string;
  account_payable_id: string;
  amount: ColumnType<string, string, string>;
  payment_method: string;
  payment_date: ColumnType<Date, string, string>;
  reference_number: string | null;
  notes: string | null;
  status: string;
  accounting_informal_entry_id: string | null;
  accounting_journal_entry_id: string | null;
  payment_group_id: string | null;
  cancelled_at: ColumnType<
    Date | null,
    string | null | undefined,
    string | null
  >;
  cancelled_by: string | null;
  cancelled_reason: string | null;
  created_at: ColumnType<Date | null, string | null | undefined, string | null>;
};

export type PublicPayablePayment = Selectable<PublicPayablePaymentsTable>;
export type NewPublicPayablePayment = Insertable<PublicPayablePaymentsTable>;

export type PublicSupplierCreditsTable = {
  id: Generated<string>;
  organization_id: string;
  supplier_id: string;
  amount: ColumnType<string, string, string>;
  remaining_amount: ColumnType<string, string, string>;
  source_payment_id: string | null;
  notes: string | null;
  created_at: ColumnType<Date | null, string | null | undefined, string | null>;
  updated_at: ColumnType<Date | null, string | null | undefined, string | null>;
};

export type PublicSupplierCredit = Selectable<PublicSupplierCreditsTable>;
export type UpdatePublicSupplierCredit = Updateable<PublicSupplierCreditsTable>;

export type PublicSupplierCreditApplicationsTable = {
  id: Generated<string>;
  organization_id: string;
  supplier_id: string;
  supplier_credit_id: string | null;
  account_payable_id: string | null;
  payable_payment_id: string | null;
  amount: ColumnType<string, string, string>;
  payment_date: ColumnType<Date, string, string>;
  reference_number: string | null;
  notes: string | null;
  created_at: ColumnType<Date | null, string | null | undefined, string | null>;
};

export type NewPublicSupplierCreditApplication =
  Insertable<PublicSupplierCreditApplicationsTable>;

export type IssuedCheckEstado =
  | "EMITIDO"
  | "DEBITADO"
  | "RECHAZADO"
  | "ANULADO";

export type IssuedChecksTable = {
  id: Generated<string>;
  org_id: string;
  operation_id: string;
  cuenta_bancaria_id: string;
  numero_cheque: string;
  importe: ColumnType<string, string, string>; // NUMERIC(15,4)
  fecha_emision: ColumnType<Date, string, string>;
  fecha_debito: ColumnType<Date, string, string>;
  beneficiario: string;
  beneficiario_id: string | null;
  notas: string | null;
  tipo: Generated<"CDF" | "ECH">;
  estado: Generated<IssuedCheckEstado>;
  referencia_pago_id: string | null;
  referencia_pago_tabla: string | null;
  journal_entry_id: string | null;
  creado_por: string | null;
  creado_at: ColumnType<Date, never, never>;
  actualizado_at: ColumnType<Date, never, never>;
};

export type IssuedCheck = Selectable<IssuedChecksTable>;
export type NewIssuedCheck = Insertable<IssuedChecksTable>;
export type UpdateIssuedCheck = Updateable<IssuedChecksTable>;

export type DepositSlipTipo = "CHEQUES" | "EFECTIVO";
export type DepositSlipEstado = "CONFIRMADA" | "ANULADA";

export type TreasuryDepositSlipsTable = {
  id: Generated<string>;
  org_id: string;
  operation_id: string;
  cuenta_bancaria_id: string;
  tipo: DepositSlipTipo;
  fecha: ColumnType<Date, string, string>;
  importe_total: ColumnType<string, string, string>; // NUMERIC(15,4)
  descripcion: string;
  cuenta_caja_code: string | null;
  journal_entry_id: string | null;
  estado: Generated<DepositSlipEstado>;
  creado_por: string | null;
  creado_at: ColumnType<Date, never, never>;
};

export type TreasuryDepositSlip = Selectable<TreasuryDepositSlipsTable>;
export type NewTreasuryDepositSlip = Insertable<TreasuryDepositSlipsTable>;

export type TreasuryDepositSlipChecksTable = {
  id: Generated<string>;
  deposit_slip_id: string;
  check_id: string;
  importe: ColumnType<string, string, string>; // NUMERIC(15,4)
};

export type TreasuryDepositSlipCheck =
  Selectable<TreasuryDepositSlipChecksTable>;
export type NewTreasuryDepositSlipCheck =
  Insertable<TreasuryDepositSlipChecksTable>;

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
  "accounting.informal_entries": InformalEntriesTable;
  "accounting.informal_entry_lines": InformalEntryLinesTable;
  "accounting.treasury_operations": TreasuryOperationsTable;
  // Treasury module
  "accounting.treasury_bank_accounts": TreasuryBankAccountsTable;
  "accounting.treasury_movements": TreasuryMovementsTable;
  "accounting.received_checks": ReceivedChecksTable;
  "accounting.received_check_endorsements": ReceivedCheckEndorsementsTable;
  "accounting.issued_checks": IssuedChecksTable;
  "accounting.treasury_deposit_slips": TreasuryDepositSlipsTable;
  "accounting.treasury_deposit_slip_checks": TreasuryDepositSlipChecksTable;
  "public.accounts_payable": PublicAccountsPayableTable;
  "public.payable_payments": PublicPayablePaymentsTable;
  "public.supplier_credits": PublicSupplierCreditsTable;
  "public.supplier_credit_applications": PublicSupplierCreditApplicationsTable;
};
