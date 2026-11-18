import "server-only";
import { z } from "zod";
import { createTypedAdminClient } from "@/lib/supabase/admin-client";
import { requireAuth } from "@/lib/supabase/auth";
import { getAvailableWarehouses } from "@/modules/inventory/service/warehouse-stock.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import type { Database } from "@/types/supabase";
import { MeliConfirmationError } from "../errors";
import { readMeliLineSnapshots } from "../utils/line-snapshots";
import {
  createMeliPhysicalReturnSchema,
  getMeliReturnAvailability,
  serializeMeliPhysicalReturn,
  sumMeliReturnQuantities,
} from "../utils/physical-return-plan";
import { getMeliSale } from "./meli-read.service";

const pageSchema = z.number().int().min(1).max(100_000);
const SOURCE_PAGE_SIZE = 25;
const HISTORY_PAGE_SIZE = 10;
const confirmationSchema = z
  .array(z.object({ return_id: z.uuid(), idempotent: z.boolean() }))
  .length(1);
const ROLLED_BACK_CODES = new Set([
  "P0001",
  "23505",
  "23514",
  "23503",
  "22023",
  "22P02",
  "22007",
  "42501",
  "40001",
  "40P01",
  "55P03",
]);

export class MeliPhysicalReturnError extends MeliConfirmationError {
  readonly requiresDefaultFallback: boolean;
  constructor(
    message: string,
    canEdit: boolean,
    requiresDefaultFallback = false
  ) {
    super(message, canEdit);
    this.name = "MeliPhysicalReturnError";
    this.requiresDefaultFallback = requiresDefaultFallback;
  }
}

async function readContext(orgSlug: string, saleId: string) {
  const sale = await getMeliSale(orgSlug, saleId);
  if (!sale) {
    throw new Error(
      "Venta Meli no encontrada o fuera de tus depósitos asignados."
    );
  }
  return { sale, admin: createTypedAdminClient() };
}

type Context = Awaited<ReturnType<typeof readContext>>;

async function loadReceivedQuantities(context: Context, movementIds: string[]) {
  const quantities = new Map<string, { quantity: number; units: number }>();
  if (!movementIds.length) {
    return quantities;
  }
  const query = context.admin
    .from("mercadolibre_return_items")
    .select(
      "source_movement_id, quantity, unit_quantity, receipt:mercadolibre_returns!inner(sales_order_id)"
    )
    .eq("organization_id", context.sale.organizationId)
    .eq("receipt.organization_id", context.sale.organizationId)
    .eq("receipt.sales_order_id", context.sale.id)
    .in("source_movement_id", movementIds)
    .order("id");
  for (let offset = 0; ; offset += 500) {
    const result = await query.range(offset, offset + 499);
    if (result.error) {
      throw new Error(
        "No se pudo consultar la mercadería ya recibida de estas salidas."
      );
    }
    for (const row of result.data) {
      const current = quantities.get(row.source_movement_id) ?? {
        quantity: 0,
        units: 0,
      };
      quantities.set(row.source_movement_id, {
        quantity: sumMeliReturnQuantities([current.quantity, row.quantity]),
        units: current.units + row.unit_quantity,
      });
    }
    if (result.data.length < 500) {
      break;
    }
  }
  return quantities;
}

async function loadOrigins(context: Context, page: number) {
  const { sale, admin } = context;
  const [result, snapshotResult] = await Promise.all([
    admin
      .from("stock_movements")
      .select(
        "id, mercadolibre_sale_item_id, quantity, unit_quantity, lot:product_lots!stock_movements_lot_id_fkey(id, lot_number, expiration_date, product_id, product_variant_id), item:sales_order_items!stock_movements_mercadolibre_sale_item_id_fkey!inner(id, description, product_id)",
        { count: "exact" }
      )
      .eq("organization_id", sale.organizationId)
      .eq("warehouse_id", sale.warehouse_id)
      .eq("type", "OUTBOUND")
      .eq("item.organization_id", sale.organizationId)
      .eq("item.sales_order_id", sale.id)
      .eq("lot.organization_id", sale.organizationId)
      .eq("lot.warehouse_id", sale.warehouse_id)
      .order("created_at")
      .order("id")
      .range((page - 1) * SOURCE_PAGE_SIZE, page * SOURCE_PAGE_SIZE - 1),
    admin
      .from("sales_orders")
      .select("commercial_snapshot")
      .eq("organization_id", sale.organizationId)
      .eq("sales_channel", "MERCADO_LIBRE")
      .eq("id", sale.id)
      .eq("warehouse_id", sale.warehouse_id)
      .single(),
  ]);
  if (result.error || snapshotResult.error) {
    throw new Error("No se pudieron consultar las salidas originales Meli.");
  }
  const snapshots = readMeliLineSnapshots(
    snapshotResult.data.commercial_snapshot
  );
  const productIds = [
    ...new Set(result.data.map((movement) => movement.item.product_id)),
  ].filter((id) => id !== null);
  const [received, products] = await Promise.all([
    loadReceivedQuantities(
      context,
      result.data.map((movement) => movement.id)
    ),
    productIds.length
      ? admin
          .from("products")
          .select("id, unit_of_measure, tracks_stock_units, has_variants")
          .eq("organization_id", sale.organizationId)
          .in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (products.error) {
    throw new Error("No se pudo verificar la unidad actual de los productos.");
  }
  return {
    page,
    totalCount: result.count ?? 0,
    pageSize: SOURCE_PAGE_SIZE,
    data: result.data.map((movement) => {
      if (
        !movement.lot ||
        movement.quantity === null ||
        !movement.mercadolibre_sale_item_id
      ) {
        throw new Error(
          "Una salida Meli no conserva su lote o cantidad original. Inventario debe revisar ese origen."
        );
      }
      const snapshot = snapshots?.[movement.item.id];
      const product = products.data.find(
        (row) => row.id === movement.item.product_id
      );
      const currentTracksUnits = Boolean(
        product &&
          ["KG", "LT"].includes(product.unit_of_measure ?? "") &&
          product.tracks_stock_units
      );
      const restockAllowed = Boolean(
        snapshot &&
          product &&
          snapshot.unit_of_measure === product.unit_of_measure &&
          currentTracksUnits === (movement.unit_quantity !== null)
      );
      const prior = received.get(movement.id) ?? { quantity: 0, units: 0 };
      const origin = {
        movementId: movement.id,
        saleId: sale.id,
        quantity: movement.quantity,
        unitQuantity: movement.unit_quantity,
        returnedQuantity: prior.quantity,
        returnedUnits: prior.units,
      };
      const remaining = getMeliReturnAvailability(origin);
      return {
        ...origin,
        name: snapshot?.name ?? movement.item.description ?? "Producto vendido",
        sku: snapshot?.sku ?? "",
        unitOfMeasure: snapshot?.unit_of_measure ?? null,
        lotNumber: movement.lot.lot_number,
        expirationDate: movement.lot.expiration_date,
        remainingQuantity: remaining.quantity,
        remainingUnits: remaining.unitQuantity,
        tracksUnits: movement.unit_quantity !== null,
        restockAllowed,
        integerQuantity: Boolean(
          movement.lot.product_variant_id || snapshot?.unit_of_measure === "UN"
        ),
      };
    }),
  };
}

export async function getMeliPhysicalReturnForm(
  orgSlug: string,
  saleId: string,
  page = 1
) {
  await ensure("mercadolibre.manage", orgSlug);
  const selectedPage = pageSchema.parse(page);
  const context = await readContext(orgSlug, saleId);
  if (context.sale.status !== "DELIVERED") {
    throw new Error("Solo se reciben devoluciones de ventas Meli entregadas.");
  }
  const [origins, warehouses] = await Promise.all([
    loadOrigins(context, selectedPage),
    getAvailableWarehouses(orgSlug, undefined, { includeInactive: true }),
  ]);
  const source = warehouses.find(
    (warehouse) => warehouse.id === context.sale.warehouse_id
  );
  if (!source) {
    throw new Error("Ya no tenés acceso al depósito de origen.");
  }
  const fallback = warehouses.find(
    (warehouse) => warehouse.is_default && warehouse.is_active
  );
  return {
    saleId: context.sale.id,
    sourceWarehouse: {
      id: source.id,
      name: source.name,
      isActive: source.is_active,
    },
    fallbackWarehouse: fallback
      ? { id: fallback.id, name: fallback.name }
      : null,
    origins,
  };
}

export async function listMeliPhysicalReturns(
  orgSlug: string,
  saleId: string,
  page = 1
) {
  const selectedPage = pageSchema.parse(page);
  const { sale, admin } = await readContext(orgSlug, saleId);
  const result = await admin
    .from("mercadolibre_returns")
    .select(
      "id, return_date, received_at, reason, warehouse:warehouses!mercadolibre_returns_warehouse_id_fkey(name)",
      { count: "exact" }
    )
    .eq("organization_id", sale.organizationId)
    .eq("sales_order_id", sale.id)
    .eq("source_warehouse_id", sale.warehouse_id)
    .eq("warehouse.organization_id", sale.organizationId)
    .order("received_at", { ascending: false })
    .order("id", { ascending: false })
    .range(
      (selectedPage - 1) * HISTORY_PAGE_SIZE,
      selectedPage * HISTORY_PAGE_SIZE - 1
    );
  if (result.error) {
    throw new Error(
      "No se pudo consultar el historial de devoluciones físicas Meli."
    );
  }
  return {
    data: result.data.map(({ warehouse, ...receipt }) => ({
      ...receipt,
      warehouseName: warehouse?.name ?? "Depósito de recepción",
    })),
    totalCount: result.count ?? 0,
    page: selectedPage,
    pageSize: HISTORY_PAGE_SIZE,
  };
}

export async function getMeliPhysicalReturnDetail(
  orgSlug: string,
  saleId: string,
  returnId: string
) {
  z.uuid().parse(returnId);
  const sale = await getMeliSale(orgSlug, saleId);
  if (!sale) {
    return null;
  }
  const admin = createTypedAdminClient();
  const result = await admin
    .from("mercadolibre_returns")
    .select(
      "id, return_date, received_at, created_by, reason, warehouse:warehouses!mercadolibre_returns_warehouse_id_fkey(name), items:mercadolibre_return_items(id, sales_order_item_id, source_movement_id, source_lot_id, quantity, unit_quantity, restock, lot:product_lots!mercadolibre_return_items_source_lot_id_fkey(lot_number, expiration_date), movements:stock_movements!stock_movements_mercadolibre_return_item_id_fkey(id, lot_id, warehouse_id, lot:product_lots!stock_movements_lot_id_fkey(lot_number)))"
    )
    .eq("organization_id", sale.organizationId)
    .eq("sales_order_id", sale.id)
    .eq("source_warehouse_id", sale.warehouse_id)
    .eq("id", returnId)
    .eq("warehouse.organization_id", sale.organizationId)
    .eq("items.organization_id", sale.organizationId)
    .eq("items.lot.organization_id", sale.organizationId)
    .eq("items.movements.organization_id", sale.organizationId)
    .eq("items.movements.lot.organization_id", sale.organizationId)
    .maybeSingle();
  if (result.error) {
    throw new Error("No se pudo consultar la devolución física Meli.");
  }
  if (!result.data) {
    return null;
  }
  if (
    !result.data.items.length ||
    result.data.items.some((item) =>
      item.restock ? item.movements.length !== 1 : item.movements.length !== 0
    )
  ) {
    throw new Error(
      "La recepción física no tiene una trazabilidad de stock completa. Inventario debe revisar el documento."
    );
  }
  const snapshotResult = await admin
    .from("sales_orders")
    .select("commercial_snapshot")
    .eq("organization_id", sale.organizationId)
    .eq("sales_channel", "MERCADO_LIBRE")
    .eq("id", sale.id)
    .eq("warehouse_id", sale.warehouse_id)
    .single();
  if (snapshotResult.error) {
    throw new Error(
      "No se pudo recuperar la descripción histórica de los productos."
    );
  }
  const snapshots = readMeliLineSnapshots(
    snapshotResult.data.commercial_snapshot
  );
  return {
    id: result.data.id,
    returnDate: result.data.return_date,
    receivedAt: result.data.received_at,
    createdBy: result.data.created_by,
    reason: result.data.reason,
    warehouseName: result.data.warehouse?.name ?? "Depósito de recepción",
    sourceWarehouseName: sale.warehouseName,
    saleNumber: sale.sale_number,
    items: result.data.items.map((item) => ({
      id: item.id,
      sourceMovementId: item.source_movement_id,
      sourceLotId: item.source_lot_id,
      name:
        snapshots?.[item.sales_order_item_id]?.name ??
        sale.items.find((line) => line.id === item.sales_order_item_id)
          ?.description ??
        "Producto vendido",
      unitOfMeasure:
        snapshots?.[item.sales_order_item_id]?.unit_of_measure ?? null,
      quantity: item.quantity,
      unitQuantity: item.unit_quantity,
      restock: item.restock,
      lotNumber: item.lot?.lot_number ?? "Lote original",
      expirationDate: item.lot?.expiration_date ?? null,
      movements: item.movements.map((movement) => ({
        id: movement.id,
        lotId: movement.lot_id,
        lotNumber: movement.lot?.lot_number ?? "Lote de recepción",
      })),
    })),
  };
}

async function commitReturn(
  admin: Context["admin"],
  args: Database["public"]["Functions"]["commit_mercadolibre_return"]["Args"]
) {
  try {
    return await admin.rpc("commit_mercadolibre_return", args);
  } catch {
    throw new MeliPhysicalReturnError(
      "No se obtuvo respuesta de la devolución. Reintentá conservando los mismos datos y clave.",
      false
    );
  }
}

export async function createMeliPhysicalReturn(orgSlug: string, raw: unknown) {
  await ensure("mercadolibre.manage", orgSlug);
  const input = createMeliPhysicalReturnSchema.parse(raw);
  const auth = await requireAuth();
  if (!auth) {
    throw new Error("No autorizado.");
  }
  const { sale, admin } = await readContext(orgSlug, input.saleId);
  // Never re-plan availability before the RPC: it reconciles a prior commit first.
  const result = await commitReturn(admin, {
    p_org_id: sale.organizationId,
    p_actor_id: auth.userId,
    p_idempotency_key: input.idempotencyKey,
    p_payload: serializeMeliPhysicalReturn(input),
  });
  if (result.error) {
    const fallback =
      result.error.details === "WAREHOUSE_FALLBACK_CONFIRMATION_REQUIRED";
    throw new MeliPhysicalReturnError(
      ROLLED_BACK_CODES.has(result.error.code)
        ? result.error.message
        : "No se pudo confirmar el resultado de la devolución. Conciliá el mismo intento.",
      ROLLED_BACK_CODES.has(result.error.code),
      fallback
    );
  }
  const confirmed = confirmationSchema.safeParse(result.data);
  if (!confirmed.success) {
    throw new MeliPhysicalReturnError(
      "La devolución no devolvió una confirmación verificable. Conciliá el mismo intento.",
      false
    );
  }
  const receipt = confirmed.data[0];
  return {
    returnId: receipt.return_id,
    saleId: sale.id,
    idempotent: receipt.idempotent,
  };
}

export type MeliPhysicalReturnFormData = Awaited<
  ReturnType<typeof getMeliPhysicalReturnForm>
>;
export type MeliPhysicalReturnSource =
  MeliPhysicalReturnFormData["origins"]["data"][number];
export type MeliPhysicalReturnHistory = Awaited<
  ReturnType<typeof listMeliPhysicalReturns>
>;
