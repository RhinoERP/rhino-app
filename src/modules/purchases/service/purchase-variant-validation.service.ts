import type { createClient } from "@/lib/supabase/server";
import {
  type PurchaseVariantLine,
  purchaseVariantAllocationChanged,
  validatePurchaseVariantAllocation,
} from "../utils/purchase-item-variants";

/** Validate changes against the organization's active product variants. */
export async function assertPurchaseVariantAllocations(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  items: PurchaseVariantLine[];
  savedItems?: PurchaseVariantLine[];
}) {
  const productIds = [...new Set(params.items.map((item) => item.product_id))];
  if (productIds.length === 0) {
    return;
  }

  const { data: products, error: productsError } = await params.supabase
    .from("products")
    .select("id, name, has_variants")
    .eq("organization_id", params.orgId)
    .in("id", productIds);
  if (productsError) {
    throw new Error(
      `No se pudieron validar los productos: ${productsError.message}`
    );
  }

  const variantProducts = new Map(
    (products ?? [])
      .filter((product) => product.has_variants)
      .map((product) => [product.id, product.name])
  );
  const savedById = new Map(params.savedItems?.map((item) => [item.id, item]));
  const itemsToValidate = params.items.filter((item) => {
    if (!variantProducts.has(item.product_id)) {
      return false;
    }
    if (!params.savedItems) {
      return true;
    }
    return purchaseVariantAllocationChanged(item, savedById.get(item.id));
  });
  if (itemsToValidate.length === 0) {
    return;
  }

  const { data: variants, error: variantsError } = await params.supabase
    .from("product_variants")
    .select("product_id, color, talle")
    .eq("organization_id", params.orgId)
    .eq("is_active", true)
    .in("product_id", [
      ...new Set(itemsToValidate.map((item) => item.product_id)),
    ]);
  if (variantsError) {
    throw new Error(
      `No se pudieron validar las variantes: ${variantsError.message}`
    );
  }

  for (const item of itemsToValidate) {
    const error = validatePurchaseVariantAllocation(
      item.quantity,
      item.variant_stocks,
      (variants ?? []).filter(
        (variant) => variant.product_id === item.product_id
      )
    );
    if (error) {
      throw new Error(`${variantProducts.get(item.product_id)}: ${error}`);
    }
  }
}
