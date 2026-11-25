import type { CustomerOpenReceivable } from "@/modules/collections/actions/get-customer-open-receivables.action";

const SPREADSHEET_FORMULA_PREFIX = /^[=+@-]/u;

export function summarizeOpenReceivables(
  accounts: CustomerOpenReceivable[],
  today: string
) {
  const byCurrency = new Map<
    string,
    { currency: string; total: number; overdue: number; notOverdue: number }
  >();
  for (const account of accounts) {
    const bucket = byCurrency.get(account.currency) ?? {
      currency: account.currency,
      total: 0,
      overdue: 0,
      notOverdue: 0,
    };
    bucket.total += account.pendingBalance;
    if (account.dueDate.slice(0, 10) < today) {
      bucket.overdue += account.pendingBalance;
    } else {
      bucket.notOverdue += account.pendingBalance;
    }
    byCurrency.set(account.currency, bucket);
  }
  return [...byCurrency.values()];
}

export function openReceivablesCsv(accounts: CustomerOpenReceivable[]) {
  const safeCell = (value: string | number | null) => {
    const text = String(value ?? "");
    // Prevent spreadsheet formula execution when opening an exported CSV.
    const escaped = SPREADSHEET_FORMULA_PREFIX.test(text.trimStart())
      ? `'${text}`
      : text;
    return `"${escaped.replaceAll('"', '""')}"`;
  };
  return [
    "Comprobante;Venta;Fecha;Vencimiento;Moneda;Importe;Saldo pendiente",
    ...accounts.map((account) =>
      [
        account.invoiceNumber,
        account.saleNumber,
        account.saleDate?.slice(0, 10) ?? null,
        account.dueDate.slice(0, 10),
        account.currency,
        account.totalAmount,
        account.pendingBalance,
      ]
        .map(safeCell)
        .join(";")
    ),
  ].join("\r\n");
}
