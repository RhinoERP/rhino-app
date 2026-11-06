import { readAuthorizedFiscalCurrency } from "@/modules/arca/fiscal-currency";

export type SaleExchangeRateSource = {
  arca_status?: string | null;
  invoice_number?: string | null;
  invoice_type?: string | null;
  exchange_rate?: number | null;
  commercial_exchange_rate?: number | null;
  commercial_snapshot?: unknown;
  arca_request_json?: unknown;
};

export function isPositiveExchangeRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function readFiscalInvoiceRate(
  request: unknown,
  stored?: number | null
) {
  const fiscal = readAuthorizedFiscalCurrency(request);
  if (fiscal.code === "DOL" && isPositiveExchangeRate(fiscal.rate)) {
    return fiscal.rate;
  }
  return isPositiveExchangeRate(stored) ? stored : null;
}

/** Fiscal for invoices, creation-time commercial agreement for uninvoiced sales. */
export function readSaleDocumentRate(
  sale: SaleExchangeRateSource | null | undefined
) {
  if (!sale) {
    return null;
  }
  if (
    sale.arca_status === "authorized" ||
    (sale.invoice_number?.trim() && sale.invoice_type?.startsWith("FACTURA_"))
  ) {
    return readFiscalInvoiceRate(sale.arca_request_json, sale.exchange_rate);
  }
  if (isPositiveExchangeRate(sale.commercial_exchange_rate)) {
    return sale.commercial_exchange_rate;
  }
  const snapshot = sale.commercial_snapshot as {
    exchangeRate?: unknown;
  } | null;
  return isPositiveExchangeRate(snapshot?.exchangeRate)
    ? snapshot.exchangeRate
    : null;
}
