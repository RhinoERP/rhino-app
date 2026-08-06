"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import type {
  ExpenseByCategoryResult,
  FinancialPeriod,
  FinancialResults,
} from "../types";

export async function getFinancialResultsAction(
  orgSlug: string,
  period: FinancialPeriod
): Promise<FinancialResults> {
  await ensure("finances.manage", orgSlug);
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    return buildEmpty(period);
  }

  const supabase = await createClient();
  const orgId = org.id;
  const { from, to } = period;

  const [
    cobrosResult,
    creditosResult,
    pagosResult,
    expensesResult,
    arResult,
    apResult,
  ] = await Promise.all([
    // Cobros — pagos recibidos de clientes
    supabase
      .from("receivable_payments")
      .select("amount")
      .eq("organization_id", orgId)
      .gte("payment_date", from)
      .lte("payment_date", to),

    // Créditos aplicados como pago
    supabase
      .from("customer_credit_applications")
      .select("amount")
      .eq("organization_id", orgId)
      .gte("payment_date", from)
      .lte("payment_date", to),

    // Pagos a proveedores
    supabase
      .from("payable_payments")
      .select("amount")
      .eq("organization_id", orgId)
      .gte("payment_date", from)
      .lte("payment_date", to),

    // Gastos operativos con categoría
    supabase
      .from("organization_expenses")
      .select("amount, category:expense_categories(id, name, is_fixed, color)")
      .eq("organization_id", orgId)
      .gte("expense_date", from)
      .lte("expense_date", to),

    // Cuentas por cobrar pendientes
    supabase
      .from("accounts_receivable")
      .select("pending_balance")
      .eq("organization_id", orgId)
      .in("status", ["PENDING", "PARTIALLY_PAID"]),

    // Cuentas por pagar pendientes
    supabase
      .from("accounts_payable")
      .select("pending_balance")
      .eq("organization_id", orgId)
      .in("status", ["PENDING", "PARTIALLY_PAID"]),
  ]);

  const salesRevenue = (cobrosResult.data ?? []).reduce(
    (sum, r) => sum + (r.amount ?? 0),
    0
  );

  const returns = (creditosResult.data ?? []).reduce(
    (sum, r) => sum + (r.amount ?? 0),
    0
  );

  const purchasesAmount = (pagosResult.data ?? []).reduce(
    (sum, r) => sum + (r.amount ?? 0),
    0
  );

  const { expensesByCategory, fixedExpenses, variableExpenses } = groupExpenses(
    expensesResult.data ?? []
  );

  const totalExpenses = purchasesAmount + fixedExpenses + variableExpenses;
  const totalRevenue = salesRevenue + returns;
  const netResult = totalRevenue - totalExpenses;

  const pendingReceivables = (arResult.data ?? []).reduce(
    (sum, r) => sum + (r.pending_balance ?? 0),
    0
  );
  const pendingPayables = (apResult.data ?? []).reduce(
    (sum, r) => sum + (r.pending_balance ?? 0),
    0
  );

  return {
    period,
    salesRevenue,
    returns,
    totalRevenue,
    purchasesAmount,
    fixedExpenses,
    variableExpenses,
    totalExpenses,
    netResult,
    expensesByCategory,
    pendingReceivables,
    pendingPayables,
  };
}

type ExpenseRow = {
  amount: number;
  category: {
    id: string;
    name: string;
    is_fixed: boolean;
    color: string;
  } | null;
};

function groupExpenses(rows: ExpenseRow[]): {
  expensesByCategory: ExpenseByCategoryResult[];
  fixedExpenses: number;
  variableExpenses: number;
} {
  const map = new Map<string, ExpenseByCategoryResult>();
  let fixedExpenses = 0;
  let variableExpenses = 0;

  for (const row of rows) {
    const key = row.category?.id ?? "sin-categoria";
    const existing = map.get(key);
    if (existing) {
      existing.amount += row.amount;
    } else {
      map.set(key, {
        categoryId: row.category?.id ?? null,
        categoryName: row.category?.name ?? "Sin categoría",
        isFixed: row.category?.is_fixed ?? false,
        color: row.category?.color ?? null,
        amount: row.amount,
      });
    }
    if (row.category?.is_fixed) {
      fixedExpenses += row.amount;
    } else {
      variableExpenses += row.amount;
    }
  }

  return {
    expensesByCategory: Array.from(map.values()).sort(
      (a, b) => b.amount - a.amount
    ),
    fixedExpenses,
    variableExpenses,
  };
}

function buildEmpty(period: FinancialPeriod): FinancialResults {
  return {
    period,
    salesRevenue: 0,
    returns: 0,
    totalRevenue: 0,
    purchasesAmount: 0,
    fixedExpenses: 0,
    variableExpenses: 0,
    totalExpenses: 0,
    netResult: 0,
    expensesByCategory: [],
    pendingReceivables: 0,
    pendingPayables: 0,
  };
}
