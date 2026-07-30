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
  lado: "DEBE" | "HABER";
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

// ── Issued Checks ─────────────────────────────────────────────────────────────

export type CreateIssuedCheckInput = {
  orgId: string;
  cuentaBancariaId: string;
  numeroCheque: string;
  importe: string; // NUMERIC string
  fechaEmision: string;
  fechaDebito: string;
  beneficiario: string;
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
