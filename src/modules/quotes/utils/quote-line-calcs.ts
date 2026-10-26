import { truncateMoney, truncateToDecimals } from "@/lib/decimal";
import { computeLineGross, type LineExtrasInput } from "@/lib/line-values";
import {
  buildItemizedTaxPlan,
  type ItemizedTaxPlan,
  type ItemTaxInput,
} from "@/modules/taxes/item-tax-calculations";

export type QuoteExtrasInput = LineExtrasInput;

// Precisión interna de los cálculos de presupuesto. La conversión de moneda
// introduce decimales no centésimos; truncar a 2 antes de tiempo acumula
// errores en cantidades grandes. Solo el total final se trunca a 2 decimales.
const CALC_PRECISION = 6;

// Shared, client-safe quote money calculation.
// Used both by the form (preview) and the server (persistence) so the
// round-trip matches to the cent. One tax line is emitted per variant row
// (one quote_items row each), mirroring how preventa/venta builds its plan.

export type QuoteCalcItem = {
  productId?: string | null;
  unitPrice: number;
  variants: Array<{ quantity: number; extras?: QuoteExtrasInput }>;
  discountPercentage?: number | null;
  taxes?: ItemTaxInput[];
};

export type QuoteTaxLine = {
  lineId: string;
  productId: string | null;
  gross: number;
  discount: number;
  net: number;
  taxes?: ItemTaxInput[];
};

export type QuoteTotals = {
  grossTotal: number;
  lineDiscountTotal: number;
  subTotal: number;
  globalDiscountAmount: number;
  netAfterDiscount: number;
  taxPlan: ItemizedTaxPlan;
  totalTaxAmount: number;
  totalAmount: number;
};

const clampPercentage = (value: number | null | undefined): number =>
  Math.min(Math.max(0, value ?? 0), 100);

export function buildQuoteTaxLines(items: QuoteCalcItem[]): QuoteTaxLine[] {
  const lines: QuoteTaxLine[] = [];

  items.forEach((item, itemIndex) => {
    const discountPercentage = clampPercentage(item.discountPercentage);

    (item.variants ?? []).forEach((variant, variantIndex) => {
      const gross = computeLineGross(
        item.unitPrice,
        variant.quantity,
        variant.extras
      );
      const discount = truncateToDecimals(
        (gross * discountPercentage) / 100,
        CALC_PRECISION
      );

      lines.push({
        lineId: `item-${itemIndex}-variant-${variantIndex}`,
        productId: item.productId ?? null,
        gross,
        discount,
        net: truncateToDecimals(Math.max(0, gross - discount), CALC_PRECISION),
        taxes: item.taxes && item.taxes.length > 0 ? item.taxes : undefined,
      });
    });
  });

  return lines;
}

export function computeQuoteTotals(params: {
  items: QuoteCalcItem[];
  globalDiscountPercentage?: number | null;
  fallbackTaxes?: ItemTaxInput[];
  lines?: QuoteTaxLine[];
}): QuoteTotals {
  const lines = params.lines ?? buildQuoteTaxLines(params.items);

  const grossTotal = truncateToDecimals(
    lines.reduce((sum, line) => sum + line.gross, 0),
    CALC_PRECISION
  );
  const lineDiscountTotal = truncateToDecimals(
    lines.reduce((sum, line) => sum + line.discount, 0),
    CALC_PRECISION
  );
  const subTotal = truncateToDecimals(
    lines.reduce((sum, line) => sum + line.net, 0),
    CALC_PRECISION
  );
  const globalDiscountAmount = truncateToDecimals(
    (subTotal * clampPercentage(params.globalDiscountPercentage)) / 100,
    CALC_PRECISION
  );
  const netAfterDiscount = truncateToDecimals(
    Math.max(0, subTotal - globalDiscountAmount),
    CALC_PRECISION
  );

  const taxPlan = buildItemizedTaxPlan({
    lines: lines.map((line) => ({
      lineId: line.lineId,
      productId: line.productId,
      netAmount: line.net,
      taxes: line.taxes,
    })),
    globalDiscountAmount,
    fallbackTaxes: params.fallbackTaxes,
    precision: CALC_PRECISION,
  });

  const totalTaxAmount = taxPlan.totalTaxAmount;
  const totalAmount = truncateMoney(netAfterDiscount + totalTaxAmount);

  return {
    grossTotal,
    lineDiscountTotal,
    subTotal,
    globalDiscountAmount,
    netAfterDiscount,
    taxPlan,
    totalTaxAmount,
    totalAmount,
  };
}

export type QuoteLineTaxEntries = Array<{
  lineId: string;
  productId: string | null;
  baseAmount: number;
  taxes: Array<{
    taxId: string | null;
    name: string;
    rate: number;
    baseAmount: number;
    taxAmount: number;
    taxCodeSnapshot: string | null;
    source: string;
  }>;
}>;

export function groupQuoteItemTaxesByLine(
  plan: ItemizedTaxPlan
): QuoteLineTaxEntries {
  const byLine = new Map<string, QuoteLineTaxEntries[number]>();

  for (const itemTax of plan.itemTaxes) {
    let entry = byLine.get(itemTax.lineId);
    if (!entry) {
      entry = {
        lineId: itemTax.lineId,
        productId: itemTax.productId,
        baseAmount: itemTax.baseAmount,
        taxes: [],
      };
      byLine.set(itemTax.lineId, entry);
    }
    entry.baseAmount = itemTax.baseAmount;
    entry.taxes.push({
      taxId: itemTax.taxId,
      name: itemTax.name,
      rate: itemTax.rate,
      baseAmount: itemTax.baseAmount,
      taxAmount: itemTax.taxAmount,
      taxCodeSnapshot: itemTax.taxCodeSnapshot,
      source: itemTax.source,
    });
  }

  return Array.from(byLine.values());
}
