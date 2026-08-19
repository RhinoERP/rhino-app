import type { createClient } from "@/lib/supabase/server";
import type { ItemTaxInput } from "@/modules/taxes/item-tax-calculations";
import { getProductTaxAssignments } from "@/modules/taxes/product-tax.service";
import {
  buildQuoteTaxLines,
  computeQuoteTotals,
  type QuoteCalcItem,
  type QuoteTaxLine,
  type QuoteTotals,
} from "../utils/quote-line-calcs";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Computes the full quote totals on the server, resolving product-level taxes
 * for lines without an explicit tax list (product taxes first, then the global
 * fallback list). Mirrors `buildSaleItemizedTaxPlan` for preventa/venta.
 */
export async function buildQuoteTotals(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  items: QuoteCalcItem[];
  globalDiscountPercentage?: number | null;
  fallbackTaxes?: ItemTaxInput[];
  lines?: QuoteTaxLine[];
}): Promise<QuoteTotals> {
  const lines = params.lines ?? buildQuoteTaxLines(params.items);
  const productIds = Array.from(
    new Set(
      lines
        .map((line) => line.productId)
        .filter((productId): productId is string => Boolean(productId))
    )
  );

  const productTaxes = await getProductTaxAssignments({
    supabase: params.supabase,
    orgId: params.orgId,
    productIds,
  });

  const linesWithProductTaxes = lines.map((line) => {
    if (line.taxes?.length) {
      return line;
    }

    const taxes = line.productId ? productTaxes.get(line.productId) : undefined;

    return taxes?.length ? { ...line, taxes } : line;
  });

  return computeQuoteTotals({
    items: params.items,
    globalDiscountPercentage: params.globalDiscountPercentage,
    fallbackTaxes: params.fallbackTaxes,
    lines: linesWithProductTaxes,
  });
}
