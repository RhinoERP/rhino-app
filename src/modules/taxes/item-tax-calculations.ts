import { truncateMoney } from "@/lib/decimal";
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

function computeLineBases(
  lines: TaxableItemLine[],
  globalDiscountAmount: number
) {
  const lineBases = new Map<string, number>();
  const totalNet = truncateMoney(
    lines.reduce((sum, line) => sum + Math.max(0, line.netAmount), 0)
  );
  const safeGlobalDiscount = truncateMoney(
    Math.min(Math.max(0, globalDiscountAmount), totalNet)
  );
  let remainingBase = truncateMoney(Math.max(0, totalNet - safeGlobalDiscount));

  lines.forEach((line, index) => {
    const isLast = index === lines.length - 1;
    const netAmount = truncateMoney(Math.max(0, line.netAmount));
    const discountShare =
      totalNet > 0
        ? truncateMoney((netAmount / totalNet) * safeGlobalDiscount)
        : 0;
    const base = isLast
      ? truncateMoney(Math.max(0, remainingBase))
      : truncateMoney(Math.max(0, netAmount - discountShare));

    lineBases.set(line.lineId, base);
    remainingBase = truncateMoney(Math.max(0, remainingBase - base));
  });

  return lineBases;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: central fiscal accumulator keeps item and aggregate rounding in one deterministic pass.
export function buildItemizedTaxPlan(params: {
  lines: TaxableItemLine[];
  globalDiscountAmount: number;
  fallbackTaxes?: ItemTaxInput[];
}): ItemizedTaxPlan {
  const lineBases = computeLineBases(params.lines, params.globalDiscountAmount);
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
        taxAmount: truncateMoney(baseAmount * (tax.rate / 100)),
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
    const expectedTaxAmount = truncateMoney(
      group.reduce((sum, tax) => sum + tax.baseAmount * (tax.rate / 100), 0)
    );
    const currentTaxAmount = truncateMoney(
      group.reduce((sum, tax) => sum + tax.taxAmount, 0)
    );
    const diff = truncateMoney(expectedTaxAmount - currentTaxAmount);

    if (Math.abs(diff) >= 0.01 && group.length > 0) {
      const last = group.at(-1);
      if (last) {
        last.taxAmount = truncateMoney(last.taxAmount + diff);
      }
    }
  }

  const aggregateByKey = new Map<string, AggregatedTaxSnapshot>();
  for (const itemTax of itemTaxes) {
    const key = taxKey(itemTax);
    const existing = aggregateByKey.get(key);

    if (existing) {
      existing.baseAmount = truncateMoney(
        existing.baseAmount + itemTax.baseAmount
      );
      existing.taxAmount = truncateMoney(
        existing.taxAmount + itemTax.taxAmount
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
  const totalTaxAmount = truncateMoney(
    aggregateTaxes.reduce((sum, tax) => sum + tax.taxAmount, 0)
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
