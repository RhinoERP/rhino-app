import type {
  DepositSlipEstado,
  DepositSlipTipo,
  IssuedCheckEstado,
  ReceivedCheckEstado,
  TreasuryMovementTipo,
} from "../../db/types";

// ── Bank Accounts ─────────────────────────────────────────────────────────────

export type CreateBankAccountInput = {
  orgId: string;
  nombre: string;
  banco: string;
  moneda: "ARS" | "USD";
  cuentaContableId: string;
  numerosCuenta?: string;
  alias?: string;
  descripcion?: string;
  creadoPor?: string;
};

export type UpdateBankAccountInput = {
  nombre?: string;
  banco?: string;
  moneda?: "ARS" | "USD";
  cuentaContableId?: string;
  numerosCuenta?: string | null;
  alias?: string | null;
  descripcion?: string | null;
};

// ── Treasury Movements ────────────────────────────────────────────────────────

export type CreateMovementInput = {
  orgId: string;
  cuentaBancariaId: string;
  tipo: TreasuryMovementTipo;
  fecha: string; // YYYY-MM-DD
  descripcion: string;
  importe: string; // NUMERIC string "0.0000"
  lado:
    | "DEBE"
    | "HABER" /** account_code de la cuenta contable contrapartida (para asientos de movimientos manuales) */;
  cuentaContrapartidaCode?: string;
  referenciaId?: string;
  referenciaTabla?: string;
  journalEntryId?: string;
  creadoPor?: string;
};

export type ListMovementsFilters = {
  orgId: string;
  cuentaId?: string;
  desde?: string;
  hasta?: string;
  tipo?: TreasuryMovementTipo;
  page?: number;
  pageSize?: number;
};

// ── Received Checks ───────────────────────────────────────────────────────────

export type CreateReceivedCheckInput = {
  orgId: string;
  numeroCheque: string;
  bancoEmisor: string;
  importe: string; // NUMERIC string
  fechaEmision: string;
  fechaVencimiento: string;
  tipo?: "CDF" | "ECH";
  librador?: string;
  libradorId?: string;
  notas?: string;
  creadoPor?: string;
};

export type UpdateReceivedCheckEstadoInput = {
  estado: ReceivedCheckEstado;
  depositSlipId?: string;
  journalEntryId?: string;
};

export type RejectReceivedCheckInput = {
  cuentaBancariaId: string;
  /** account_code contrapartida: por defecto 'CHEQUES_RECHAZADOS', configurable */
  cuentaContrapartidaCode?: string;
  creadoPor?: string;
};

// ── Issued Checks ─────────────────────────────────────────────────────────────

export type CreateIssuedCheckInput = {
  orgId: string;
  cuentaBancariaId: string;
  numeroCheque: string;
  importe: string; // NUMERIC string
  fechaEmision: string;
  fechaDebito: string;
  beneficiario: string;
  tipo?: "CDF" | "ECH";
  beneficiarioId?: string;
  notas?: string;
  referenciaPagoId?: string;
  referenciaPagoTabla?: string;
  creadoPor?: string;
};

export type UpdateIssuedCheckEstadoInput = {
  estado: IssuedCheckEstado;
  journalEntryId?: string;
};

export type RejectIssuedCheckInput = {
  /** account_code de la cuenta contrapartida (requerido para el asiento contable) */
  cuentaContrapartidaCode: string;
  creadoPor?: string;
};

// ── Deposit Slips ─────────────────────────────────────────────────────────────

export type CreateCheckDepositSlipInput = {
  orgId: string;
  cuentaBancariaId: string;
  fecha: string;
  descripcion: string;
  checkIds: string[]; // received_check IDs to include
  creadoPor?: string;
};

export type CreateCashDepositSlipInput = {
  orgId: string;
  cuentaBancariaId: string;
  fecha: string;
  descripcion: string;
  importe: string; // NUMERIC string
  cuentaCajaCode: string;
  creadoPor?: string;
};

export type DepositSlipWithChecks = {
  id: string;
  orgId: string;
  cuentaBancariaId: string;
  tipo: DepositSlipTipo;
  fecha: Date;
  importeTotal: string;
  descripcion: string;
  cuentaCajaCode: string | null;
  journalEntryId: string | null;
  estado: DepositSlipEstado;
  creadoPor: string | null;
  creadoAt: Date;
  checks: Array<{
    id: string;
    checkId: string;
    importe: string;
  }>;
};
