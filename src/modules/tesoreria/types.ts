export type BankMovementType =
  | "debit"
  | "credit"
  | "adjustment_positive"
  | "adjustment_negative"
  | "rejected_check";

export const BANK_MOVEMENT_TYPE_LABELS: Record<BankMovementType, string> = {
  debit: "Débito",
  credit: "Crédito",
  adjustment_positive: "Ajuste positivo",
  adjustment_negative: "Ajuste negativo",
  rejected_check: "Cheque rechazado",
};

export type CheckStatus = "pending" | "debited" | "exchanged" | "overdue";

export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  pending: "Sin debitar",
  debited: "Debitado",
  exchanged: "Canjeado",
  overdue: "Vencido",
};

export type BankAccount = {
  id: string;
  organization_id: string;
  name: string;
  bank_name: string;
  account_number: string | null;
  currency: string;
  current_balance: number;
  is_active: boolean;
  created_at: string;
};

export type BankMovement = {
  id: string;
  organization_id: string;
  bank_account_id: string;
  movement_type: BankMovementType;
  concept: string;
  amount: number;
  movement_date: string;
  accounting_account_code: string | null;
  accounting_account_name: string | null;
  notes: string | null;
  created_at: string;
  bank_account?: Pick<BankAccount, "name" | "bank_name">;
};

export type IssuedCheck = {
  id: string;
  organization_id: string;
  bank_account_id: string;
  check_number: string;
  payee: string;
  issue_date: string;
  payment_date: string;
  amount: number;
  status: CheckStatus;
  notes: string | null;
  created_at: string;
  bank_account?: Pick<BankAccount, "name" | "bank_name">;
};

export type CreateBankMovementInput = {
  bank_account_id: string;
  movement_type: BankMovementType;
  concept: string;
  amount: number;
  movement_date: string;
  accounting_account_code?: string;
  accounting_account_name?: string;
  notes?: string;
};

export type CreateIssuedCheckInput = {
  bank_account_id: string;
  check_number: string;
  payee: string;
  issue_date: string;
  payment_date: string;
  amount: number;
  notes?: string;
};

export type UpdateCheckStatusInput = {
  id: string;
  status: CheckStatus;
};

// Cuentas contables disponibles para movimientos bancarios
export type AccountingAccount = {
  code: string;
  name: string;
  group: string;
  blockedForBankMovements?: boolean; // regla: IIBB de facturación no puede usarse en movimientos bancarios
};

export const ACCOUNTING_ACCOUNTS: AccountingAccount[] = [
  { code: "5.1.01", name: "Gastos Bancarios", group: "Egresos" },
  { code: "1.1.01", name: "Caja y Bancos", group: "Activo" },
  { code: "1.1.02", name: "Cuentas a Cobrar", group: "Activo" },
  { code: "1.1.03", name: "IVA Crédito Fiscal", group: "Activo" },
  { code: "2.1.01", name: "Proveedores a Pagar", group: "Pasivo" },
  { code: "5.1.02", name: "Honorarios y Servicios", group: "Egresos" },
  { code: "5.1.03", name: "Alquiler", group: "Egresos" },
  {
    code: "2.1.03",
    name: "Ingresos Brutos a Pagar",
    group: "Pasivo",
    blockedForBankMovements: true, // ⚠️ Solo para facturación, no para retenciones bancarias
  },
];

export type LiquidityAlert = {
  date: string; // YYYY-MM-DD
  checks: IssuedCheck[];
  totalAmount: number;
};
