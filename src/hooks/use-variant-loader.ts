"use client";

import { useCallback, useEffect, useState } from "react";
import type { PurchaseItem } from "@/components/purchases/forms/purchase-items-list";
import { getProductVariantsAction } from "@/modules/inventory/actions/product.actions";

export type VariantMeta = {
  talles: string[];
  colores: string[];
};

function loadVariantMetasForItems(
  items: PurchaseItem[],
  loadMeta: (productId: string) => void
): void {
  for (const item of items) {
    if (item.has_variants) {
      loadMeta(item.product_id);
    }
  }
}

export function useVariantLoader(orgSlug: string, items: PurchaseItem[]) {
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
      if (variants.length === 0) {
        return;
      }
      const talles = Array.from(new Set(variants.map((v) => v.talle))).sort();
      const colores = Array.from(new Set(variants.map((v) => v.color))).sort();
      setVariantMetaMap((prev) => ({
        ...prev,
        [productId]: { talles, colores },
      }));
    },
    [orgSlug, loadedVariantIds, variantMetaMap]
  );

  useEffect(() => {
    loadVariantMetasForItems(items, loadVariantMeta);
  }, [items, loadVariantMeta]);

  return { variantMetaMap };
}
