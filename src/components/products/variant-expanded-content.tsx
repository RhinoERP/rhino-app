"use client";

import { useProductVariants } from "@/modules/inventory/hooks/use-product-variants";
import type { ProductVariantWithStock } from "@/modules/inventory/types";
import { VariantStockMatrix } from "./variant-stock-matrix";

type VariantExpandedContentProps = {
  productId: string;
  orgSlug: string;
};

function transformVariants(variants: ProductVariantWithStock[]): {
  talles: string[];
  colores: string[];
  stocks: Record<string, Record<string, number>>;
} {
  const talles = [...new Set(variants.map((v) => v.talle))];
  const colores = [...new Set(variants.map((v) => v.color))];
  talles.sort();
  colores.sort();

  const stocks: Record<string, Record<string, number>> = {};
  for (const v of variants) {
    if (!stocks[v.color]) {
      stocks[v.color] = {};
    }
    stocks[v.color][v.talle] = v.product_lots?.quantity_available ?? 0;
  }

  return { talles, colores, stocks };
}

export function VariantExpandedContent({
  productId,
  orgSlug,
}: VariantExpandedContentProps) {
  const {
    data: variants,
    isLoading,
    error,
  } = useProductVariants(orgSlug, productId);

  const { talles, colores, stocks } = transformVariants(variants);

  return (
    <div className="px-6 py-4">
      <VariantStockMatrix
        colores={colores}
        errorMessage={error?.message ?? null}
        isLoading={isLoading}
        stocks={stocks}
        talles={talles}
      />
    </div>
  );
}
