export type SaleRateState = {
  currency: string | null;
  arcaStatus: string | null;
  invoiceType: string | null;
  invoiceNumber: string | null;
  exchangeRate: number | null;
  commercialExchangeRate: number | null;
};

export function assertSaleRateUpdate(
  sale: SaleRateState,
  input: {
    invoiceType?: string;
    invoiceNumber?: string | null;
    fiscalExchangeRate?: number | null;
    commercialExchangeRate?: number | null;
  }
) {
  if (
    input.commercialExchangeRate !== undefined &&
    sale.commercialExchangeRate !== null &&
    input.commercialExchangeRate !== sale.commercialExchangeRate
  ) {
    throw new Error(
      "La cotización comercial acordada al crear la venta es fija."
    );
  }
  const externalInvoice =
    Boolean(sale.invoiceNumber?.trim()) &&
    sale.invoiceType?.startsWith("FACTURA_");
  const locked =
    sale.arcaStatus === "pending" ||
    sale.arcaStatus === "authorized" ||
    externalInvoice;
  if (
    locked &&
    input.fiscalExchangeRate !== undefined &&
    input.fiscalExchangeRate !== sale.exchangeRate
  ) {
    throw new Error(
      "No se puede modificar la cotización de una factura registrada o en emisión."
    );
  }
  const invoiceType = input.invoiceType ?? sale.invoiceType;
  const invoiceNumber =
    input.invoiceNumber === undefined
      ? sale.invoiceNumber
      : input.invoiceNumber;
  const rate =
    input.fiscalExchangeRate === undefined
      ? sale.exchangeRate
      : input.fiscalExchangeRate;
  if (
    sale.currency === "USD" &&
    invoiceType?.startsWith("FACTURA_") &&
    invoiceNumber?.trim() &&
    !(typeof rate === "number" && Number.isFinite(rate) && rate > 0)
  ) {
    throw new Error(
      "Confirmá una cotización fiscal mayor a cero al registrar la factura USD."
    );
  }
}
