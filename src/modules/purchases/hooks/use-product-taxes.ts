"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { ItemTaxInput } from "@/modules/taxes/item-tax-calculations";

type ProductTaxAssignment = {
  product_id: string;
  tax: {
    id: string;
    name: string;
    rate: number;
    code: string | null;
    is_active: boolean;
  } | null;
};

export function useProductTaxes(orgSlug: string, productIds: string[]) {
  const stableKey = useMemo(
    () => [...productIds].sort().join(","),
    [productIds]
  );

  return useQuery<Map<string, ItemTaxInput[]>>({
    queryKey: ["product-taxes", orgSlug, stableKey],
    queryFn: async (): Promise<Map<string, ItemTaxInput[]>> => {
      if (productIds.length === 0) {
        return new Map();
      }

      const res = await fetch(
        `/api/org/${orgSlug}/productos/taxes?ids=${productIds.join(",")}`
      );
      if (!res.ok) {
        throw new Error("Failed to fetch product taxes");
      }

      const data: ProductTaxAssignment[] = await res.json();
      const taxesByProductId = new Map<string, ItemTaxInput[]>();

      for (const row of data) {
        if (!(row.product_id && row.tax?.id && row.tax.is_active)) {
          continue;
        }

        const existing = taxesByProductId.get(row.product_id) ?? [];
        existing.push({
          taxId: row.tax.id,
          name: row.tax.name,
          rate: row.tax.rate,
          taxCodeSnapshot: row.tax.code ?? null,
          source: "product",
        });
        taxesByProductId.set(row.product_id, existing);
      }

      return taxesByProductId;
    },
    enabled: productIds.length > 0,
  });
}
