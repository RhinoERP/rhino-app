import { createClient, type SupabaseServerClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getStockMeasureTotals } from "../utils/stock-measure-totals";
import { getAvailableWarehouses } from "./warehouse-stock.service";

type BreakdownWarehouse = {
  id: string;
  name: string;
  is_active: boolean;
  is_default: boolean;
};

type BreakdownLot = {
  warehouse_id: string;
  product_id: string;
  quantity_available: number;
  unit_quantity_available: number | null;
};

type BreakdownProduct = {
  id: string;
  unit_of_measure: string | null;
  tracks_stock_units: boolean | null;
};

export type WarehouseStockBreakdown = {
  warehouseId: string;
  warehouseName: string;
  isActive: boolean;
  isDefault: boolean;
  productCount: number;
  lotCount: number;
  totalUnits: number;
  totalKg: number;
  totalLt: number;
};

type ProductAccumulator = {
  quantity: number;
};

type WarehouseAccumulator = {
  lotCount: number;
  products: Map<string, ProductAccumulator>;
};

function addLot(
  accumulators: Map<string, WarehouseAccumulator>,
  lot: BreakdownLot
) {
  if (lot.quantity_available <= 0) {
    return;
  }
  const current = accumulators.get(lot.warehouse_id) ?? {
    lotCount: 0,
    products: new Map<string, ProductAccumulator>(),
  };
  current.lotCount += 1;
  const product = current.products.get(lot.product_id) ?? {
    quantity: 0,
  };
  product.quantity += lot.quantity_available;
  current.products.set(lot.product_id, product);
  accumulators.set(lot.warehouse_id, current);
}

function aggregateWarehouse(
  warehouse: BreakdownWarehouse,
  accumulator: WarehouseAccumulator | undefined,
  productsById: Map<string, BreakdownProduct>
): WarehouseStockBreakdown {
  let productCount = 0;
  let totalUnits = 0;
  let totalKg = 0;
  let totalLt = 0;

  for (const [productId, totals] of accumulator?.products ?? []) {
    const product = productsById.get(productId);
    if (!product || totals.quantity <= 0) {
      continue;
    }
    productCount += 1;
    const measures = getStockMeasureTotals(
      totals.quantity,
      product.unit_of_measure
    );
    totalUnits += measures.units;
    totalKg += measures.kg;
    totalLt += measures.lt;
  }

  return {
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    isActive: warehouse.is_active,
    isDefault: warehouse.is_default,
    productCount,
    lotCount: accumulator?.lotCount ?? 0,
    totalUnits: Math.round(totalUnits * 100) / 100,
    totalKg: Math.round(totalKg * 10) / 10,
    totalLt: Math.round(totalLt * 10) / 10,
  };
}

export function buildWarehouseStockBreakdown(
  warehouses: BreakdownWarehouse[],
  lots: BreakdownLot[],
  products: BreakdownProduct[]
): WarehouseStockBreakdown[] {
  const productsById = new Map(
    products.map((product) => [product.id, product])
  );
  const accumulators = new Map<string, WarehouseAccumulator>();
  for (const lot of lots) {
    if (productsById.has(lot.product_id)) {
      addLot(accumulators, lot);
    }
  }

  return warehouses.map((warehouse) =>
    aggregateWarehouse(warehouse, accumulators.get(warehouse.id), productsById)
  );
}

const PAGE_SIZE = 1000;

async function fetchBreakdownLots(
  supabase: SupabaseServerClient,
  orgId: string,
  warehouseIds: string[]
): Promise<BreakdownLot[]> {
  const result: BreakdownLot[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("product_lots")
      .select(
        "warehouse_id, product_id, quantity_available, unit_quantity_available"
      )
      .eq("organization_id", orgId)
      .in("warehouse_id", warehouseIds)
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      throw new Error(`No se pudo consultar el stock: ${error.message}`);
    }
    result.push(...data);
    if (data.length < PAGE_SIZE) {
      return result;
    }
  }
}

async function fetchBreakdownProducts(
  supabase: SupabaseServerClient,
  orgId: string,
  productIds: string[]
): Promise<BreakdownProduct[]> {
  const result: BreakdownProduct[] = [];
  for (let offset = 0; offset < productIds.length; offset += PAGE_SIZE) {
    const chunk = productIds.slice(offset, offset + PAGE_SIZE);
    const { data, error } = await supabase
      .from("products")
      .select("id, unit_of_measure, tracks_stock_units")
      .eq("organization_id", orgId)
      .in("id", chunk);
    if (error) {
      throw new Error(
        `No se pudieron consultar los productos: ${error.message}`
      );
    }
    result.push(...data);
  }
  return result;
}

export async function getWarehouseStockBreakdown(
  orgSlug: string
): Promise<WarehouseStockBreakdown[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const warehouses = await getAvailableWarehouses(orgSlug, undefined, {
    includeInactive: true,
  });
  if (warehouses.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const lots = await fetchBreakdownLots(
    supabase,
    org.id,
    warehouses.map((warehouse) => warehouse.id)
  );
  const productIds = [...new Set(lots.map((lot) => lot.product_id))];
  const products = await fetchBreakdownProducts(supabase, org.id, productIds);

  return buildWarehouseStockBreakdown(warehouses, lots, products);
}
