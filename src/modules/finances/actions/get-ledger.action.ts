"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import type { FinancialPeriod, LedgerEntry, LedgerSource } from "../types";

type RawEntry = {
  id: string;
  date: string;
  concept: string;
  source: LedgerSource;
  debit: number | null;
  credit: number | null;
  nonCashAmount: number | null;
  reference_id: string;
};

export async function getLedgerAction(
  orgSlug: string,
  period: FinancialPeriod
): Promise<LedgerEntry[]> {
  await ensure(READ_PERMISSIONS.finances, orgSlug);
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    return [];
  }

  const supabase = await createClient();
  const orgId = org.id;
  const { from, to } = period;

  const [cobrosData, creditosData, pagosData, expensesData] = await Promise.all(
    [
      // Cobros — pagos recibidos de clientes
      supabase
        .from("receivable_payments")
        .select(
          "id, payment_date, amount, accounts_receivable(customers(business_name))"
        )
        .eq("organization_id", orgId)
        .gte("payment_date", from)
        .lte("payment_date", to),

      // Créditos aplicados como pago
      supabase
        .from("customer_credit_applications")
        .select("id, payment_date, amount, customers(business_name)")
        .eq("organization_id", orgId)
        .gte("payment_date", from)
        .lte("payment_date", to),

      // Pagos a proveedores
      supabase
        .from("payable_payments")
        .select("id, payment_date, amount, accounts_payable(suppliers(name))")
        .eq("organization_id", orgId)
        .gte("payment_date", from)
        .lte("payment_date", to),

      // Gastos operativos
      supabase
        .from("organization_expenses")
        .select(
          "id, expense_date, description, amount, category:expense_categories(name)"
        )
        .eq("organization_id", orgId)
        .gte("expense_date", from)
        .lte("expense_date", to),
    ]
  );

  const entries: RawEntry[] = [];

  for (const p of cobrosData.data ?? []) {
    const row = p as {
      id: string;
      payment_date: string;
      amount: number;
      accounts_receivable: {
        customers: { business_name: string } | null;
      } | null;
    };
    const customerName =
      row.accounts_receivable?.customers?.business_name ?? "Cliente";
    entries.push({
      id: `cobro-${row.id}`,
      date: row.payment_date,
      concept: `Cobro — ${customerName}`,
      source: "cobro",
      debit: null,
      credit: row.amount,
      nonCashAmount: null,
      reference_id: row.id,
    });
  }

  for (const c of creditosData.data ?? []) {
    const row = c as {
      id: string;
      payment_date: string;
      amount: number;
      customers: { business_name: string } | null;
    };
    const customerName = row.customers?.business_name ?? "Cliente";
    entries.push({
      id: `cred-${row.id}`,
      date: row.payment_date,
      concept: `Aplicación de anticipo — ${customerName}`,
      source: "credito_cliente",
      debit: null,
      credit: null,
      nonCashAmount: row.amount,
      reference_id: row.id,
    });
  }

  for (const p of pagosData.data ?? []) {
    const row = p as {
      id: string;
      payment_date: string;
      amount: number;
      accounts_payable: { suppliers: { name: string } | null } | null;
    };
    const supplierName = row.accounts_payable?.suppliers?.name ?? "Proveedor";
    entries.push({
      id: `pago-${row.id}`,
      date: row.payment_date,
      concept: `Pago proveedor — ${supplierName}`,
      source: "pago_proveedor",
      debit: row.amount,
      credit: null,
      nonCashAmount: null,
      reference_id: row.id,
    });
  }

  for (const exp of expensesData.data ?? []) {
    const catName = (exp.category as { name: string } | null)?.name ?? "Gasto";
    entries.push({
      id: `exp-${exp.id}`,
      date: exp.expense_date as string,
      concept: `${catName} — ${exp.description}`,
      source: "gasto_operativo",
      debit: exp.amount as number,
      credit: null,
      nonCashAmount: null,
      reference_id: exp.id,
    });
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));

  let balance = 0;
  return entries.map((e) => {
    balance += (e.credit ?? 0) - (e.debit ?? 0);
    return { ...e, running_balance: balance };
  });
}
