import type { SupabaseServerClient } from "@/lib/supabase/server";
import {
  isPositiveExchangeRate as isPositiveRate,
  readFiscalInvoiceRate,
  readSaleDocumentRate,
} from "@/modules/sales/document-exchange-rate";

export const NO_RECEIVABLE_INVOICE_RATE_MESSAGE =
  "No se encontró la cotización de la factura o la cotización acordada en el presupuesto/venta. Completala en el documento de origen antes de cobrar.";

export const NO_PAYABLE_INVOICE_RATE_MESSAGE =
  "El pago no tiene una factura de compra registrada con cotización. Registrá la factura antes de pagar.";

/**
 * Resuelve la cotización fijada por la factura de venta de una deuda USD.
 * La factura autorizada es la fuente fiscal. Sin factura se utiliza únicamente
 * el acuerdo comercial; nunca la cotización actual ni un valor enviado al pagar.
 */
type ReceivableRateParams = {
  supabase: SupabaseServerClient;
  orgId: string;
  receivable: {
    currency: string | null | undefined;
    sales_order_id: string | null | undefined;
    manual_fiscal_invoice_id?: string | null;
  };
  existingPayment?: {
    exchange_rate?: number | null;
    created_at?: string | null;
  };
};

async function manualInvoiceRate(params: ReceivableRateParams) {
  const { data, error } = await params.supabase
    .from("manual_fiscal_invoices" as never)
    .select("currency, status, exchange_rate, arca_request_json")
    .eq("id", params.receivable.manual_fiscal_invoice_id as string)
    .eq("organization_id", params.orgId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  const invoice = data as {
    currency: string;
    status: string;
    exchange_rate: number | null;
    arca_request_json: unknown;
  } | null;
  if (invoice?.currency !== "USD" || invoice.status !== "authorized") {
    return null;
  }
  return readFiscalInvoiceRate(
    invoice.arca_request_json,
    invoice.exchange_rate
  );
}

/** Resolve from the invoice, or the commercial agreement for an uninvoiced AR. */
export async function resolveReceivableExchangeRate(
  params: ReceivableRateParams
): Promise<number | null> {
  const { receivable } = params;
  if ((receivable.currency ?? "ARS") !== "USD") {
    return null;
  }
  if (receivable.manual_fiscal_invoice_id) {
    return manualInvoiceRate(params);
  }
  if (!receivable.sales_order_id) {
    return null;
  }

  const { data: sale, error } = await params.supabase
    .from("sales_orders")
    .select(
      "exchange_rate, commercial_exchange_rate, commercial_snapshot, arca_status, arca_authorized_at, invoice_number, invoice_type, arca_request_json"
    )
    .eq("id", receivable.sales_order_id)
    .eq("organization_id", params.orgId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!sale) {
    return null;
  }

  const invoiced =
    sale.arca_status === "authorized" ||
    (Boolean(sale.invoice_number?.trim()) &&
      sale.invoice_type?.startsWith("FACTURA_"));
  // A later invoice must not revalue collections already recorded commercially.
  const payment = params.existingPayment;
  const confirmedAt =
    sale.arca_authorized_at ??
    (sale.arca_request_json as { fiscalRateConfirmedAt?: string } | null)
      ?.fiscalRateConfirmedAt;
  if (
    invoiced &&
    payment?.created_at &&
    confirmedAt &&
    Date.parse(payment.created_at) < Date.parse(confirmedAt) &&
    isPositiveRate(payment.exchange_rate)
  ) {
    return payment.exchange_rate;
  }
  return readSaleDocumentRate(sale);
}

/**
 * Resuelve la cotización fijada por la factura de compra de una deuda USD.
 * La factura vinculada tiene prioridad; una copia en AP no sustituye una factura.
 */
export async function resolvePayableExchangeRate(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  payable: {
    currency?: string | null | undefined;
    supplier_id: string;
    purchase_order_id: string | null | undefined;
    supplier_invoice_id?: string | null;
    exchange_rate?: number | null;
  };
}): Promise<number | null> {
  const { payable } = params;
  if ((payable.currency ?? "ARS") !== "USD") {
    return null;
  }

  if (payable.supplier_invoice_id) {
    const { data: invoice, error: invoiceError } = await params.supabase
      .from("supplier_invoices")
      .select("exchange_rate, currency, status")
      .eq("id", payable.supplier_invoice_id)
      .eq("organization_id", params.orgId)
      .eq("supplier_id", payable.supplier_id)
      .maybeSingle();
    if (invoiceError) {
      throw new Error(
        `No se pudo resolver la factura del pago: ${invoiceError.message}`
      );
    }
    const rate = Number(invoice?.exchange_rate);
    return invoice?.status === "REGISTERED" &&
      invoice.currency === "USD" &&
      isPositiveRate(rate)
      ? rate
      : null;
  }
  if (!payable.purchase_order_id) {
    return null;
  }

  const { data: invoices, error } = await params.supabase
    .from("supplier_invoices" as never)
    .select("exchange_rate, currency")
    .eq("purchase_order_id", payable.purchase_order_id)
    .eq("supplier_id", payable.supplier_id)
    .eq("organization_id", params.orgId)
    .eq("status", "REGISTERED");
  if (error) {
    throw new Error(
      `No se pudo resolver la cotización legacy: ${error.message}`
    );
  }
  const rates = (invoices ?? []).map(
    (invoice: { exchange_rate?: number | null; currency?: string }) =>
      invoice.currency === "USD" ? Number(invoice.exchange_rate) : Number.NaN
  );
  if (
    rates.length === 0 ||
    rates.some((rate) => !isPositiveRate(rate)) ||
    new Set(rates).size !== 1
  ) {
    return null;
  }
  return rates[0];
}
