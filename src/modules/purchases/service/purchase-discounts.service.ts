import type { SupabaseClient } from "@supabase/supabase-js";
import { truncateMoney } from "@/lib/decimal";
import { getBaseUnitPrice } from "@/modules/inventory/utils/case-units";
import type { Database } from "@/types/supabase";
import {
  calculateHabitualUnitCost,
  getPurchaseDiscountDetails,
  type PurchaseDiscountDetails,
  purchaseDiscountDetailsChanged,
  validatePurchaseDiscountDetails,
} from "../utils/purchase-discounts";

type Client = SupabaseClient<Database>;

async function getSettings(supabase: Client, orgId: string) {
  const { data, error } = await supabase
    .from("organization_settings")
    .select("settings")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) {
    throw new Error(
      `No se pudo leer la configuración de descuentos: ${error.message}`
    );
  }
  const settings = data?.settings as Record<string, unknown> | null;
  return {
    enabled: settings?.purchase_discounts_enabled === true,
    includeTaxes: settings?.post_invoice_discounts_include_taxes === true,
  };
}

export async function enrichPurchaseProducts<
  T extends {
    id: string | null;
    active_price_list_id: string | null;
    cost_price: number | null;
    unit_of_measure: string | null;
    units_per_box: number | null;
  },
>(
  supabase: Client,
  orgId: string,
  products: T[]
): Promise<(T & { purchase_discounts?: PurchaseDiscountDetails })[]> {
  const settings = await getSettings(supabase, orgId);
  if (!settings.enabled || products.length === 0) {
    return products;
  }
  const listIds = [
    ...new Set(
      products.flatMap((p) =>
        p.active_price_list_id ? [p.active_price_list_id] : []
      )
    ),
  ];
  const [lists, itemBatches] = await Promise.all([
    listIds.length
      ? supabase
          .from("price_lists")
          .select("id, habitual_discount_method")
          .eq("organization_id", orgId)
          .in("id", listIds)
      : Promise.resolve({ data: [], error: null }),
    Promise.all(
      listIds.map((listId) =>
        supabase
          .from("price_list_items")
          .select("*")
          .eq("price_list_id", listId)
          .in(
            "product_id",
            products
              .filter((product) => product.active_price_list_id === listId)
              .flatMap((product) => (product.id ? [product.id] : []))
          )
      )
    ),
  ]);
  if (lists.error || itemBatches.some((batch) => batch.error)) {
    throw new Error(
      "No se pudieron cargar los descuentos de las listas del proveedor"
    );
  }
  const methods = new Map(
    (lists.data ?? []).map((list) => [list.id, list.habitual_discount_method])
  );
  const details = new Map(
    itemBatches
      .flatMap((batch) => batch.data ?? [])
      .map((item) => [`${item.price_list_id}:${item.product_id}`, item])
  );
  return products.map((product) => {
    const item = details.get(`${product.active_price_list_id}:${product.id}`);
    if (
      product.active_price_list_id &&
      !(item && methods.has(product.active_price_list_id))
    ) {
      throw new Error(
        "No se pudieron obtener los descuentos de la lista vigente del producto"
      );
    }
    return {
      ...product,
      purchase_discounts: getPurchaseDiscountDetails({
        ...item,
        list_unit_cost: getBaseUnitPrice(
          item?.list_price ?? product.cost_price ?? 0,
          product.unit_of_measure,
          product.units_per_box
        ),
        habitual_discount_method:
          methods.get(product.active_price_list_id ?? "") ?? "sequential",
        post_invoice_discounts_include_taxes: settings.includeTaxes,
      }),
    };
  });
}

type PurchaseDiscountLine = PurchaseDiscountDetails & {
  id?: string;
  product_id?: string;
  unit_cost: number;
  quantity: number;
  unit_quantity?: number | null;
  subtotal: number;
  unit_of_measure?: string | null;
  units_per_box?: number | null;
  discount_percentage?: number;
};
type SavedDiscountLine = PurchaseDiscountDetails & {
  id: string;
  product_id: string;
};

function assertHistoricalDiscounts(
  item: PurchaseDiscountLine,
  savedById: ReadonlyMap<string, SavedDiscountLine>
) {
  const saved = item.id ? savedById.get(item.id) : undefined;
  const previous = saved?.product_id === item.product_id ? saved : undefined;
  if (purchaseDiscountDetailsChanged(item, previous ?? {})) {
    throw new Error(
      "Solo se pueden conservar los descuentos existentes mientras la función está deshabilitada"
    );
  }
}

function repriceHabitualLine<T extends PurchaseDiscountLine>(item: T): T {
  if (item.list_unit_cost == null) {
    return item;
  }
  const unitCost = calculateHabitualUnitCost(
    item.list_unit_cost,
    item,
    item.unit_of_measure,
    item.units_per_box
  );
  const quantity = ["KG", "LT", "MT"].includes(item.unit_of_measure ?? "")
    ? (item.unit_quantity ?? item.quantity)
    : item.quantity;
  const discount = item.discount_percentage ?? 0;
  if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
    throw new Error("El descuento del producto debe estar entre 0 y 100%");
  }
  return {
    ...item,
    unit_cost: unitCost,
    subtotal: truncateMoney(quantity * unitCost * (1 - discount / 100)),
  };
}

/** Recompute financial amounts from habitual discounts only. Post-invoice inputs
 * are validated and serialized independently from the payable's fiscal plan. */
export async function resolvePurchaseDiscountItems<
  T extends PurchaseDiscountLine,
>(
  supabase: Client,
  orgId: string,
  items: T[],
  savedItems: SavedDiscountLine[] = []
): Promise<T[]> {
  const savedById = new Map(savedItems.map((item) => [item.id, item]));
  const source =
    savedItems.length === 0
      ? items
      : items.map((item) => {
          const saved = item.id ? savedById.get(item.id) : undefined;
          if (!saved || saved.product_id !== item.product_id) {
            return item;
          }
          return {
            ...item,
            ...getPurchaseDiscountDetails(saved),
            ...Object.fromEntries(
              Object.entries(item).filter(([, value]) => value !== undefined)
            ),
          };
        });
  if (
    ![...source, ...savedItems].some(
      (item) => Object.keys(getPurchaseDiscountDetails(item)).length > 0
    )
  ) {
    return source;
  }
  const settings = await getSettings(supabase, orgId);
  return source.map((item) => {
    validatePurchaseDiscountDetails(item);
    if (!settings.enabled) {
      assertHistoricalDiscounts(item, savedById);
    }
    return repriceHabitualLine(item);
  });
}
