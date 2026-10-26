import { truncateToDecimals } from "@/lib/decimal";
import { normalizeArcaTaxCode } from "@/modules/arca/tax-codes";

export type ItemTaxInput = {
  taxId: string;
  name: string;
  rate: number;
  taxCodeSnapshot?: string | null;
  source?: ItemTaxSource;
};

export type ItemTaxSource =
  | "product"
  | "manual"
  | "fallback"
  | "legacy_prorated";

export type TaxableItemLine = {
  lineId: string;
  productId: string | null;
  netAmount: number;
  taxes?: ItemTaxInput[];
};

export type ItemTaxSnapshot = {
  lineId: string;
  productId: string | null;
  taxId: string | null;
  name: string;
  rate: number;
  baseAmount: number;
  taxAmount: number;
  taxCodeSnapshot: string | null;
  source: ItemTaxSource;
};

export type AggregatedTaxSnapshot = {
  taxId: string | null;
  name: string;
  rate: number;
  baseAmount: number;
  taxAmount: number;
  taxCodeSnapshot: string | null;
};

export type ItemizedTaxPlan = {
  lineBases: Map<string, number>;
  itemTaxes: ItemTaxSnapshot[];
  aggregateTaxes: AggregatedTaxSnapshot[];
  totalTaxAmount: number;
};

function taxKey(tax: {
  taxId: string | null;
  name: string;
  rate: number;
  taxCodeSnapshot: string | null;
}) {
  return [
    tax.taxId ?? "no-tax-id",
    tax.name.trim().toLowerCase(),
    String(tax.rate),
    tax.taxCodeSnapshot ?? "",
  ].join(":");
}

function normalizeTaxInput(tax: ItemTaxInput): ItemTaxInput {
  return {
    taxId: tax.taxId,
    name: tax.name,
    rate: Number(tax.rate ?? 0),
    taxCodeSnapshot: normalizeArcaTaxCode(tax.taxCodeSnapshot) ?? null,
    source: tax.source ?? "product",
  };
}

function moneyToCents(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(truncateToDecimals(value, precision) * factor);
}

function centsToMoney(value: number, precision = 2): number {
  return truncateToDecimals(value / 10 ** precision, precision);
}

function computeLineBases(
  lines: TaxableItemLine[],
  globalDiscountAmount: number,
  precision = 2
) {
  const lineBases = new Map<string, number>();
  const lineNetCents = lines.map((line) =>
    moneyToCents(Math.max(0, line.netAmount), precision)
  );
  const totalNetCents = lineNetCents.reduce((sum, cents) => sum + cents, 0);
  const safeGlobalDiscountCents = Math.min(
    Math.max(0, moneyToCents(globalDiscountAmount, precision)),
    totalNetCents
  );
  let remainingBaseCents = Math.max(0, totalNetCents - safeGlobalDiscountCents);

  lines.forEach((line, index) => {
    const isLast = index === lines.length - 1;
    const netAmountCents = lineNetCents[index] ?? 0;
    const discountShareCents =
      totalNetCents > 0
        ? Math.floor((netAmountCents * safeGlobalDiscountCents) / totalNetCents)
        : 0;
    const baseCents = isLast
      ? Math.max(0, remainingBaseCents)
      : Math.max(0, netAmountCents - discountShareCents);

    lineBases.set(line.lineId, centsToMoney(baseCents, precision));
    remainingBaseCents = Math.max(0, remainingBaseCents - baseCents);
  });

  return lineBases;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: central fiscal accumulator keeps item and aggregate rounding in one deterministic pass.
export function buildItemizedTaxPlan(params: {
  lines: TaxableItemLine[];
  globalDiscountAmount: number;
  fallbackTaxes?: ItemTaxInput[];
  /** Decimales de precisión interna (default 2 centavos). Usar 6 para flujos con conversión de moneda. */
  precision?: number;
}): ItemizedTaxPlan {
  const precision = params.precision ?? 2;
  const lineBases = computeLineBases(
    params.lines,
    params.globalDiscountAmount,
    precision
  );
  const fallbackTaxes = (params.fallbackTaxes ?? []).map((tax) => ({
    ...normalizeTaxInput(tax),
    source: tax.source ?? "fallback",
  }));
  const itemTaxes: ItemTaxSnapshot[] = [];

  for (const line of params.lines) {
    const baseAmount = lineBases.get(line.lineId) ?? 0;
    const selectedTaxes =
      line.taxes && line.taxes.length > 0
        ? line.taxes.map(normalizeTaxInput)
        : fallbackTaxes;

    for (const tax of selectedTaxes) {
      itemTaxes.push({
        lineId: line.lineId,
        productId: line.productId,
        taxId: tax.taxId,
        name: tax.name,
        rate: tax.rate,
        baseAmount,
        taxAmount: truncateToDecimals(baseAmount * (tax.rate / 100), precision),
        taxCodeSnapshot: tax.taxCodeSnapshot ?? null,
        source: tax.source ?? "product",
      });
    }
  }

  const itemTaxesByKey = new Map<string, ItemTaxSnapshot[]>();
  for (const itemTax of itemTaxes) {
    const key = taxKey(itemTax);
    const group = itemTaxesByKey.get(key) ?? [];
    group.push(itemTax);
    itemTaxesByKey.set(key, group);
  }

  for (const group of itemTaxesByKey.values()) {
    const expectedTaxAmount = truncateToDecimals(
      group.reduce((sum, tax) => sum + tax.baseAmount * (tax.rate / 100), 0),
      precision
    );
    const currentTaxAmount = truncateToDecimals(
      group.reduce((sum, tax) => sum + tax.taxAmount, 0),
      precision
    );
    const diff = truncateToDecimals(
      expectedTaxAmount - currentTaxAmount,
      precision
    );

    if (Math.abs(diff) >= 10 ** -precision && group.length > 0) {
      const last = group.at(-1);
      if (last) {
        last.taxAmount = truncateToDecimals(last.taxAmount + diff, precision);
      }
    }
  }

  const aggregateByKey = new Map<string, AggregatedTaxSnapshot>();
  for (const itemTax of itemTaxes) {
    const key = taxKey(itemTax);
    const existing = aggregateByKey.get(key);

    if (existing) {
      existing.baseAmount = truncateToDecimals(
        existing.baseAmount + itemTax.baseAmount,
        precision
      );
      existing.taxAmount = truncateToDecimals(
        existing.taxAmount + itemTax.taxAmount,
        precision
      );
      continue;
    }

    aggregateByKey.set(key, {
      taxId: itemTax.taxId,
      name: itemTax.name,
      rate: itemTax.rate,
      baseAmount: itemTax.baseAmount,
      taxAmount: itemTax.taxAmount,
      taxCodeSnapshot: itemTax.taxCodeSnapshot,
    });
  }

  const aggregateTaxes = Array.from(aggregateByKey.values());
  const totalTaxAmount = truncateToDecimals(
    aggregateTaxes.reduce((sum, tax) => sum + tax.taxAmount, 0),
    precision
  );

  return {
    lineBases,
    itemTaxes,
    aggregateTaxes,
    totalTaxAmount,
  };
}

export function toFallbackItemTaxes(
  taxes: Array<{
    taxId: string;
    name: string;
    rate: number;
    taxCodeSnapshot?: string | null;
  }>
): ItemTaxInput[] {
  return taxes.map((tax) => ({
    taxId: tax.taxId,
    name: tax.name,
    rate: tax.rate,
    taxCodeSnapshot: tax.taxCodeSnapshot ?? null,
    source: "fallback",
  }));
}
