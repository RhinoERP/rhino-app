"use client";

import { useCallback, useEffect, useState } from "react";
import { getProductVariantsAction } from "@/modules/inventory/actions/product.actions";

export type VariantMeta = {
  talles: string[];
  colores: string[];
  availableSizesByColor: Record<string, string[]>;
};

function loadVariantMetasForItems(
  items: Array<{ product_id: string; has_variants?: boolean }>,
  loadMeta: (productId: string) => void
): void {
  for (const item of items) {
    if (item.has_variants) {
      loadMeta(item.product_id);
    }
  }
}

export function useVariantLoader(
  orgSlug: string,
  items: Array<{ product_id: string; has_variants?: boolean }>
) {
  const [variantMetaMap, setVariantMetaMap] = useState<
    Record<string, VariantMeta>
  >({});
  const [loadedVariantIds, setLoadedVariantIds] = useState<Set<string>>(
    new Set()
  );

  const loadVariantMeta = useCallback(
    async (productId: string) => {
      if (loadedVariantIds.has(productId) || variantMetaMap[productId]) {
        return;
      }
      setLoadedVariantIds((prev) => new Set(prev).add(productId));
      const variants = await getProductVariantsAction(orgSlug, productId);
      const talles = Array.from(new Set(variants.map((v) => v.talle))).sort();
      const colores = Array.from(new Set(variants.map((v) => v.color))).sort();
      const availableSizesByColor = Object.fromEntries(
        colores.map((color) => [
          color,
          variants
            .filter((variant) => variant.color === color)
            .map((variant) => variant.talle),
        ])
      );
      setVariantMetaMap((prev) => ({
        ...prev,
        [productId]: { talles, colores, availableSizesByColor },
      }));
    },
    [orgSlug, loadedVariantIds, variantMetaMap]
  );

  useEffect(() => {
    loadVariantMetasForItems(items, loadVariantMeta);
  }, [items, loadVariantMeta]);

  return { variantMetaMap };
}
