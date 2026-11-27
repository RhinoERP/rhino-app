import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

type ProductUnit = Pick<
  Database["public"]["Tables"]["products"]["Row"],
  "id" | "unit_of_measure" | "units_per_box"
>;

/** Resolve commercial metadata from tenant-scoped products, never request JSON. */
export async function getTransactionProductUnits(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  productIds: string[]
): Promise<Map<string, ProductUnit>> {
  const ids = [...new Set(productIds)];
  const products = new Map<string, ProductUnit>();
  for (let offset = 0; offset < ids.length; offset += 200) {
    const { data, error } = await supabase
      .from("products")
      .select("id, unit_of_measure, units_per_box")
      .eq("organization_id", organizationId)
      .in("id", ids.slice(offset, offset + 200));
    if (error) {
      throw new Error("No se pudieron validar las unidades de los productos");
    }
    for (const product of data ?? []) {
      if (
        product.unit_of_measure === "CAJA" &&
        (!Number.isSafeInteger(product.units_per_box) ||
          (product.units_per_box ?? 0) <= 0)
      ) {
        throw new Error(
          "El producto por caja tiene un factor de empaque inválido"
        );
      }
      products.set(product.id, product);
    }
  }
  if (products.size !== ids.length) {
    throw new Error("Producto no encontrado para esta organización");
  }
  return products;
}

export function assertCaseQuantity(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new Error("La cantidad por caja debe expresarse en unidades enteras");
  }
}
