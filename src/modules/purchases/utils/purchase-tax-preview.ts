import { truncateMoney } from "@/lib/decimal";
import type { ItemTaxInput } from "@/modules/taxes/item-tax-calculations";

export type TaxPreview = {
  taxId: string;
  name: string;
  rate: number;
  baseAmount: number;
  taxAmount: number;
};

const moneyToCents = (value: number): number =>
  Math.round(truncateMoney(value) * 100);

const centsToMoney = (value: number): number => truncateMoney(value / 100);

export function calculatePurchaseTaxPreview(params: {
  items: Array<{ product_id: string; subtotal: number }>;
  productTaxes: Map<string, ItemTaxInput[]>;
  globalDiscountPercent?: number;
}): { taxes: TaxPreview[]; totalTaxAmount: number } {
  const subtotal = params.items.reduce(
    (sum, item) => sum + truncateMoney(item.subtotal),
    0
  );
  const discountPercent = Math.min(
    Math.max(0, params.globalDiscountPercent ?? 0),
    100
  );
  const discountAmountCents = Math.min(
    Math.max(0, moneyToCents((discountPercent / 100) * subtotal)),
    moneyToCents(subtotal)
  );
  const totalNetCents = moneyToCents(subtotal);

  if (totalNetCents <= 0 || params.items.length === 0) {
    return { taxes: [], totalTaxAmount: 0 };
  }

  const taxMap = new Map<string, TaxPreview>();
  let remainingBaseCents = totalNetCents - discountAmountCents;

  params.items.forEach((item, index) => {
    const isLast = index === params.items.length - 1;
    const itemNetCents = moneyToCents(item.subtotal);
    const discountShareCents =
      totalNetCents > 0
        ? Math.floor((itemNetCents * discountAmountCents) / totalNetCents)
        : 0;
    const itemBaseCents = isLast
      ? Math.max(0, remainingBaseCents)
      : Math.max(0, itemNetCents - discountShareCents);
    remainingBaseCents = Math.max(0, remainingBaseCents - itemBaseCents);

    if (itemBaseCents <= 0) {
      return;
    }

    const itemBase = centsToMoney(itemBaseCents);
    const taxes = params.productTaxes.get(item.product_id) ?? [];

    for (const tax of taxes) {
      const existing = taxMap.get(tax.taxId);
      const taxAmount = truncateMoney(itemBase * (tax.rate / 100));

      if (existing) {
        existing.baseAmount = truncateMoney(existing.baseAmount + itemBase);
        existing.taxAmount = truncateMoney(existing.taxAmount + taxAmount);
      } else {
        taxMap.set(tax.taxId, {
          taxId: tax.taxId,
          name: tax.name,
          rate: tax.rate,
          baseAmount: itemBase,
          taxAmount,
        });
      }
    }
  });

  const taxes = Array.from(taxMap.values());
  const totalTaxAmount = truncateMoney(
    taxes.reduce((sum, tax) => sum + tax.taxAmount, 0)
  );

  return { taxes, totalTaxAmount };
}
