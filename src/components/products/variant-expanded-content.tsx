"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProductVariantWithStock } from "@/modules/inventory/service/inventory.service";
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
    stocks[v.color][v.talle] = v.stock;
  }

  return { talles, colores, stocks };
}

export function VariantExpandedContent({
  productId,
  orgSlug,
}: VariantExpandedContentProps) {
  const [variants, setVariants] = useState<ProductVariantWithStock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVariants = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/org/${orgSlug}/stock/${productId}/variants`
      );
      if (!res.ok) {
        throw new Error("Error al cargar variantes");
      }
      const data: ProductVariantWithStock[] = await res.json();
      setVariants(data);
    } catch {
      setError("Error al cargar variantes");
    } finally {
      setIsLoading(false);
    }
  }, [orgSlug, productId]);

  useEffect(() => {
    fetchVariants();
  }, [fetchVariants]);

  const { talles, colores, stocks } = transformVariants(variants);

  return (
    <div className="px-6 py-4">
      <VariantStockMatrix
        colores={colores}
        errorMessage={error}
        isLoading={isLoading}
        stocks={stocks}
        talles={talles}
      />
    </div>
  );
}
