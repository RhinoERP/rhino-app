import { fetchSuggestedUsdQuote } from "@/lib/usd-quote";
import { ArcaValidationError } from "../errors";
import {
  type AuthorizedArcaFiscalCurrency,
  buildInvoiceFiscalCurrency,
} from "../fiscal-currency";

/** One rate for the submitted voucher, persisted invoice and subsequent payments. */
export async function resolveInvoiceExchangeRate(
  currency: string | null | undefined,
  suppliedRate?: number | null
): Promise<AuthorizedArcaFiscalCurrency> {
  const fiscal = buildInvoiceFiscalCurrency(currency);
  if (fiscal.code === "PES") {
    return { ...fiscal, rate: 1 };
  }
  const rate = suppliedRate ?? (await fetchSuggestedUsdQuote()).venta;
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new ArcaValidationError(
      "Ingresá una cotización fiscal USD mayor a cero."
    );
  }
  return { ...fiscal, rate };
}
