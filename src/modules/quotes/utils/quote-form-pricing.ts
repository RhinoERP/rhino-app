import { truncateMoney } from "@/lib/decimal";
import { computeLineGross } from "@/lib/line-values";
import {
  calculateSalePrice,
  type SalePriceAdjustment,
} from "@/modules/price-levels/service/price-calculator";
import type { PriceLevel } from "@/modules/price-levels/types";
import type { QuoteFormValues } from "@/modules/quotes/types";
import type { SaleProduct } from "@/modules/sales/types";
import type { SalesPriceList } from "@/modules/sales-price-lists/types";
import {
  convertPriceToQuoteCurrency,
  needsExchangeRate,
  revalueQuotedPriceForRate,
} from "./currency-conversion";

type QuoteItem = QuoteFormValues["items"][number];

export type QuotePricing = {
  level: PriceLevel | null;
  adjustment: SalesPriceList | null;
};

export function computeQuoteItemSubtotal(
  item: Pick<QuoteItem, "unitPrice" | "variants">
): number {
  return truncateMoney(
    item.variants.reduce(
      (total, variant) =>
        total +
        computeLineGross(item.unitPrice, variant.quantity, variant.extras),
      0
    )
  );
}

export function getAdjustedQuoteUnitPrice(
  product: SaleProduct,
  pricing: QuotePricing,
  currency: string,
  exchangeRate: number | null | undefined
): number {
  const adjustments: SalePriceAdjustment[] = pricing.adjustment
    ? [{ type: pricing.adjustment.type, value: pricing.adjustment.value }]
    : [];
  const { price } = calculateSalePrice({
    basePrice: product.price || 0,
    costPrice: product.costPrice,
    level: pricing.level,
    adjustments,
  });
  return convertPriceToQuoteCurrency(
    price,
    product.currency ?? "ARS",
    currency,
    exchangeRate
  );
}

type RepriceParams = {
  items: QuoteFormValues["items"];
  products: SaleProduct[];
  pricing: QuotePricing;
  currency: string;
  exchangeRate: number | null | undefined;
};

export function repriceQuoteItems({
  items,
  products,
  pricing,
  currency,
  exchangeRate,
  rateOnly = false,
  previousRate,
}: RepriceParams & {
  rateOnly?: boolean;
  previousRate?: number | null;
}): QuoteFormValues["items"] {
  return items.map((item) => {
    const product = products.find(
      (candidate) => candidate.id === item.productId
    );
    if (!product) {
      return item;
    }
    let unitPrice: number;
    if (rateOnly) {
      unitPrice = revalueQuotedPriceForRate({
        price: item.unitPrice,
        productCurrency: item.productCurrency ?? product.currency,
        quoteCurrency: currency,
        previousRate,
        newRate: exchangeRate,
      });
    } else if (needsExchangeRate(product.currency, currency, exchangeRate)) {
      return item;
    } else {
      unitPrice = getAdjustedQuoteUnitPrice(
        product,
        pricing,
        currency,
        exchangeRate
      );
    }
    if (unitPrice === item.unitPrice) {
      return item;
    }
    return {
      ...item,
      unitPrice,
      subtotal: computeQuoteItemSubtotal({ ...item, unitPrice }),
    };
  });
}

export function convertQuoteItemsCurrency({
  items,
  currency,
  exchangeRate,
  previousCurrency,
}: {
  items: QuoteFormValues["items"];
  previousCurrency: string;
  currency: string;
  exchangeRate: number;
}): QuoteFormValues["items"] {
  return items.map((item) => {
    const unitPrice = convertPriceToQuoteCurrency(
      item.unitPrice,
      previousCurrency,
      currency,
      exchangeRate
    );
    const variants = item.variants.map((variant) => ({
      ...variant,
      extras: variant.extras.map((extra) => ({
        ...extra,
        price: convertPriceToQuoteCurrency(
          extra.price,
          previousCurrency,
          currency,
          exchangeRate
        ),
      })),
    }));
    return {
      ...item,
      unitPrice,
      variants,
      subtotal: computeQuoteItemSubtotal({ unitPrice, variants }),
    };
  });
}
