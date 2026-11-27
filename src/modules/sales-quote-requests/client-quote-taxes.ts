import { z } from "zod";
import { truncateMoney } from "@/lib/decimal";
import {
  buildItemizedTaxPlan,
  type ItemTaxInput,
  type ItemTaxSnapshot,
} from "@/modules/taxes/item-tax-calculations";

export const additionalQuoteTaxSchema = z.object({
  name: z.string().trim().min(1).max(100),
  rate: z.number().finite().positive().max(100),
});

export type AdditionalQuoteTax = z.infer<typeof additionalQuoteTaxSchema>;

export type QuoteTaxLine = {
  lineId: string;
  productId: string;
  netAmount: number;
  taxes?: ItemTaxInput[];
};

export function calculateQuoteTaxes(
  lines: QuoteTaxLine[],
  additionalTaxes: AdditionalQuoteTax[]
): {
  itemTaxes: ItemTaxSnapshot[];
  taxBreakdown: { name: string; rate: number; taxAmount: number }[];
  subtotal: number;
  taxAmount: number;
  total: number;
} {
  const productPlan = buildItemizedTaxPlan({
    globalDiscountAmount: 0,
    lines,
  });
  const manualPlan = buildItemizedTaxPlan({
    globalDiscountAmount: 0,
    lines: lines.map((line) => ({
      ...line,
      taxes: additionalTaxes.map((tax, index) => ({
        taxId: `manual-${index}`,
        name: tax.name,
        rate: tax.rate,
        source: "manual" as const,
      })),
    })),
  });
  const itemTaxes = [
    ...productPlan.itemTaxes,
    ...manualPlan.itemTaxes.map((tax) => ({ ...tax, taxId: null })),
  ];
  const subtotal = truncateMoney(
    lines.reduce((sum, line) => sum + line.netAmount, 0)
  );
  const taxAmount = truncateMoney(
    productPlan.totalTaxAmount + manualPlan.totalTaxAmount
  );
  return {
    itemTaxes,
    taxBreakdown: [
      ...productPlan.aggregateTaxes,
      ...manualPlan.aggregateTaxes,
    ].map((tax) => ({
      name: tax.name,
      rate: tax.rate,
      taxAmount: truncateMoney(tax.taxAmount),
    })),
    subtotal,
    taxAmount,
    total: truncateMoney(subtotal + taxAmount),
  };
}
