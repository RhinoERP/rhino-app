import type { SupabaseServerClient } from "@/lib/supabase/server";
import { readAuthorizedFiscalCurrency } from "@/modules/arca/fiscal-currency";

export const NO_RECEIVABLE_INVOICE_RATE_MESSAGE =
  "La venta no tiene una factura emitida con cotización. Facturá la venta antes de cobrar.";

export const NO_PAYABLE_INVOICE_RATE_MESSAGE =
  "El pago no tiene una factura de compra registrada con cotización. Registrá la factura antes de pagar.";

function isPositiveRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Resuelve la cotización fijada por la factura de venta de una deuda USD.
 * Primero usa `sales_orders.exchange_rate` (persistida al emitir la factura);
 * como respaldo lee el snapshot fiscal autorizado de ARCA para ventas ya
 * facturadas antes de persistir la tasa.
 */
export async function resolveReceivableExchangeRate(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  receivable: {
    currency: string | null | undefined;
    sales_order_id: string | null | undefined;
  };
}): Promise<number | null> {
  const { receivable } = params;
  if ((receivable.currency ?? "ARS") !== "USD" || !receivable.sales_order_id) {
    return null;
  }

  const { data: sale } = await params.supabase
    .from("sales_orders")
    .select("exchange_rate, arca_request_json")
    .eq("id", receivable.sales_order_id)
    .eq("organization_id", params.orgId)
    .maybeSingle();

  if (!sale) {
    return null;
  }

  const storedRate = Number(
    (sale as { exchange_rate?: number | null }).exchange_rate
  );
  if (isPositiveRate(storedRate)) {
    return storedRate;
  }

  const requestJson = (sale as { arca_request_json?: unknown })
    .arca_request_json;
  if (requestJson) {
    const fiscal = readAuthorizedFiscalCurrency(requestJson);
    if (fiscal.code === "DOL" && isPositiveRate(fiscal.rate)) {
      return fiscal.rate;
    }
  }

  return null;
}

/**
 * Resuelve la cotización fijada por la factura de compra de una deuda USD.
 * Primero usa `accounts_payable.exchange_rate` (si ya se registró) y como
 * respaldo la factura de compra ligada a la orden de compra.
 */
export async function resolvePayableExchangeRate(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  payable: {
    currency?: string | null | undefined;
    supplier_id: string;
    purchase_order_id: string | null | undefined;
    exchange_rate?: number | null;
  };
}): Promise<number | null> {
  const { payable } = params;
  if ((payable.currency ?? "ARS") !== "USD") {
    return null;
  }

  if (isPositiveRate(payable.exchange_rate)) {
    return payable.exchange_rate;
  }

  if (!payable.purchase_order_id) {
    return null;
  }

  const { data: invoice } = await params.supabase
    .from("supplier_invoices" as never)
    .select("exchange_rate")
    .eq("purchase_order_id", payable.purchase_order_id)
    .eq("supplier_id", payable.supplier_id)
    .eq("organization_id", params.orgId)
    .order("created_at", { ascending: false })
    .maybeSingle();

  const invoiceRate = Number(
    (invoice as { exchange_rate?: number | null } | null)?.exchange_rate
  );
  if (invoice && isPositiveRate(invoiceRate)) {
    return invoiceRate;
  }

  return null;
}
