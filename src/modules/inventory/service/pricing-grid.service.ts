import { truncateMoney, truncateToDecimals } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { ProductPricingItem } from "../types";

type MarginRpcClient = {
  rpc: (
    fn: "update_product_profit_margin" | "upsert_direct_sale_price_for_margin",
    args: Record<string, unknown>
  ) => Promise<{ error: { message: string } | null }>;
};

export async function getPricingGridData(
  orgSlug: string
): Promise<ProductPricingItem[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data: products, error } = await supabase
    .from("products_with_price")
    .select(
      "id, sku, name, supplier_id, category_id, cost_price, profit_margin, calculated_sale_price, is_active"
    )
    .eq("organization_id", org.id)
    .order("name");

  if (error) {
    throw new Error(`Error fetching products: ${error.message}`);
  }

  const supplierIds = [
    ...new Set(
      products
        ?.map((p) => p.supplier_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const supplierNames = new Map<string, string>();

  if (supplierIds.length > 0) {
    const { data: suppliers } = await supabase
      .from("suppliers")
      .select("id, name")
      .in("id", supplierIds);

    for (const s of suppliers ?? []) {
      supplierNames.set(s.id, s.name);
    }
  }

  const { data: allCategories } = await supabase
    .from("categories")
    .select("id, name, parent_id")
    .eq("organization_id", org.id);

  const categoryNameMap = new Map<string, string>();
  const categoryParentMap = new Map<string, string | null>();
  for (const c of allCategories ?? []) {
    categoryNameMap.set(c.id, c.name);
    categoryParentMap.set(c.id, c.parent_id);
  }

  function resolveRootCategory(categoryId: string | null): string | null {
    if (!categoryId) {
      return null;
    }
    const visited = new Set<string>();
    let current: string | null = categoryId;
    while (current) {
      if (visited.has(current)) {
        break;
      }
      visited.add(current);
      const parentId = categoryParentMap.get(current);
      if (!parentId) {
        return categoryNameMap.get(current) ?? null;
      }
      current = parentId;
    }
    return categoryNameMap.get(categoryId) ?? null;
  }

  function resolveSubRootCategory(categoryId: string | null): string | null {
    if (!categoryId) {
      return null;
    }
    const path: string[] = [];
    const visited = new Set<string>();
    let current: string | null = categoryId;
    while (current) {
      if (visited.has(current)) {
        break;
      }
      visited.add(current);
      path.push(current);
      const parentId = categoryParentMap.get(current);
      if (!parentId) {
        break;
      }
      current = parentId;
    }
    if (path.length <= 1) {
      return null;
    }
    const subRootId = path.at(-2);
    if (!subRootId) {
      return null;
    }
    return categoryNameMap.get(subRootId) ?? null;
  }

  return (products ?? []).map((p) => ({
    product_id: p.id ?? "",
    sku: p.sku ?? "",
    name: p.name ?? "",
    supplier_id: p.supplier_id,
    supplier_name: p.supplier_id
      ? (supplierNames.get(p.supplier_id) ?? null)
      : null,
    category_name: p.category_id
      ? (categoryNameMap.get(p.category_id) ?? null)
      : null,
    root_category_name: resolveRootCategory(p.category_id),
    sub_root_category_name: resolveSubRootCategory(p.category_id),
    cost_price: p.cost_price,
    profit_margin: p.profit_margin,
    calculated_sale_price: p.calculated_sale_price,
    is_active: p.is_active,
  }));
}

export async function getDirectSalePricingGridData(
  orgSlug: string
): Promise<ProductPricingItem[]> {
  const baseItems = await getPricingGridData(orgSlug);
  if (baseItems.length === 0) {
    return [];
  }

  const supabase = await createClient();

  const productIds = baseItems.map((item) => item.product_id);

  const { data: directPrices } = await supabase
    .from("direct_sale_prices")
    .select("product_id, price")
    .in("product_id", productIds);

  const priceMap = new Map<string, number>();
  for (const dp of directPrices ?? []) {
    priceMap.set(dp.product_id, dp.price);
  }

  return baseItems.map((item) => ({
    ...item,
    direct_sale_price: priceMap.get(item.product_id) ?? null,
  }));
}

export async function updateWholesalePrice(
  orgSlug: string,
  productId: string,
  newPrice: number
): Promise<void> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data: product, error: fetchError } = await supabase
    .from("products_with_price")
    .select("cost_price")
    .eq("id", productId)
    .eq("organization_id", org.id)
    .single();

  if (fetchError || !product) {
    throw new Error("Producto no encontrado");
  }

  if (product.cost_price == null || product.cost_price <= 0) {
    throw new Error("El producto no tiene un precio de costo asignado");
  }

  const newMargin = truncateToDecimals(
    (newPrice / product.cost_price - 1) * 100,
    4
  );

  if (newMargin < 0) {
    throw new Error("El precio de venta no puede ser menor al precio de costo");
  }

  const { error: updateError } = await supabase
    .from("products")
    .update({
      profit_margin: newMargin,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId)
    .eq("organization_id", org.id);

  if (updateError) {
    throw new Error(`Error al actualizar el margen: ${updateError.message}`);
  }
}

export async function updateWholesaleMargin(
  orgSlug: string,
  productId: string,
  newMargin: number
): Promise<void> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { error } = await (supabase as unknown as MarginRpcClient).rpc(
    "update_product_profit_margin",
    {
      p_org_id: org.id,
      p_product_id: productId,
      p_margin: truncateMoney(newMargin),
    }
  );

  if (error) {
    throw new Error(`Error al actualizar el margen: ${error.message}`);
  }
}

export async function updateDirectMargin(
  orgSlug: string,
  productId: string,
  newMargin: number
): Promise<void> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { error } = await (supabase as unknown as MarginRpcClient).rpc(
    "upsert_direct_sale_price_for_margin",
    {
      p_org_id: org.id,
      p_product_id: productId,
      p_margin: truncateMoney(newMargin),
    }
  );

  if (error) {
    throw new Error(`Error al actualizar el margen: ${error.message}`);
  }
}

export async function upsertDirectSalePrice(
  orgSlug: string,
  productId: string,
  price: number
): Promise<void> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { error } = await supabase.from("direct_sale_prices").upsert(
    {
      organization_id: org.id,
      product_id: productId,
      price: truncateMoney(price),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,product_id" }
  );

  if (error) {
    throw new Error(
      `Error al actualizar precio de venta directa: ${error.message}`
    );
  }
}

export async function deleteDirectSalePrice(
  orgSlug: string,
  productId: string
): Promise<void> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("direct_sale_prices")
    .delete()
    .eq("organization_id", org.id)
    .eq("product_id", productId);

  if (error) {
    throw new Error(
      `Error al eliminar precio de venta directa: ${error.message}`
    );
  }
}
