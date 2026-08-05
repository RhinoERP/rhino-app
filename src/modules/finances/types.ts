export type { PaymentMethod } from "@/modules/collections/types";

export type ExpenseCategory = {
  id: string;
  organization_id: string;
  name: string;
  is_fixed: boolean;
  color: string | null;
  created_at: string | null;
};

export type OrganizationExpense = {
  id: string;
  organization_id: string;
  category_id: string | null;
  description: string;
  amount: number;
  expense_date: string;
  payment_method: string | null;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  category?: ExpenseCategory | null;
};

export type LedgerSource =
  | "cobro"
  | "credito_cliente"
  | "pago_proveedor"
  | "gasto_operativo";

export type LedgerEntry = {
  id: string;
  date: string;
  concept: string;
  source: LedgerSource;
  debit: number | null;
  credit: number | null;
  nonCashAmount: number | null;
  running_balance: number;
  reference_id: string;
};

export type FinancialPeriodKey =
  | "este-mes"
  | "mes-anterior"
  | "trimestre"
  | "este-año"
  | "custom";

export type FinancialPeriod = {
  from: string;
  to: string;
  label: string;
};

export type ExpenseByCategoryResult = {
  categoryId: string | null;
  categoryName: string;
  isFixed: boolean;
  color: string | null;
  amount: number;
};

export type FinancialResults = {
  period: FinancialPeriod;
  cashCollections: number;
  nonCashCreditApplications: number;
  cashInflows: number;
  purchasesAmount: number;
  fixedExpenses: number;
  variableExpenses: number;
  totalExpenses: number;
  netCashFlow: number;
  expensesByCategory: ExpenseByCategoryResult[];
  pendingReceivables: number;
  pendingPayables: number;
  deferredAdvanceBalance: number;
  deferredAdvanceCount: number;
};

export type CreateExpenseInput = {
  categoryId: string | null;
  description: string;
  amount: number;
  expense_date: string;
  payment_method: string | null;
  reference_number?: string;
  notes?: string;
};

export type UpdateExpenseInput = CreateExpenseInput & {
  id: string;
};

export type ExpenseActionResult =
  | { success: true; expense: OrganizationExpense }
  | { success: false; error: string };

export type DeleteExpenseResult =
  | { success: true }
  | { success: false; error: string };
