import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { requireAuth } from "@/lib/supabase/auth";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Json } from "@/types/supabase";
import { assertWarehouseAccess } from "./warehouse-stock.service";

export const stockTransferItemSchema = z.object({
  sourceLotId: z.uuid(),
  quantity: z.number().positive("La cantidad debe ser mayor a 0"),
  unitQuantity: z
    .number()
    .nonnegative("Las unidades no pueden ser negativas")
    .optional(),
});

export const createStockTransferSchema = z
  .object({
    orgSlug: z.string().trim().min(1),
    sourceWarehouseId: z.uuid(),
    destinationWarehouseId: z.uuid(),
    reason: z.string().trim().max(500).optional(),
    items: z
      .array(stockTransferItemSchema)
      .min(1, "Agregá al menos un lote")
      .max(100),
  })
  .refine(
    (values) => values.sourceWarehouseId !== values.destinationWarehouseId,
    {
      path: ["destinationWarehouseId"],
      message: "El depósito destino debe ser distinto del origen",
    }
  )
  .refine(
    (values) =>
      new Set(values.items.map((item) => item.sourceLotId)).size ===
      values.items.length,
    { path: ["items"], message: "No se puede repetir el lote de origen" }
  );

export type CreateStockTransferInput = z.input<
  typeof createStockTransferSchema
>;

type TransferLot = {
  id: string;
  product_id: string;
  quantity_available: number;
  unit_quantity_available: number | null;
};

type TransferProduct = {
  id: string;
  unit_of_measure: string | null;
  tracks_stock_units: boolean | null;
};

type TransferItemInput = z.infer<typeof stockTransferItemSchema>;

function buildTransferItem(
  item: TransferItemInput,
  lotsById: Map<string, TransferLot>,
  productsById: Map<string, TransferProduct>
) {
  const lot = lotsById.get(item.sourceLotId);
  if (!lot) {
    throw new Error("El lote seleccionado no pertenece al depósito de origen");
  }
  const product = productsById.get(lot.product_id);
  if (!product) {
    throw new Error("Producto del lote no encontrado en la organización");
  }
  const tracksUnits =
    (product.unit_of_measure === "KG" || product.unit_of_measure === "LT") &&
    Boolean(product.tracks_stock_units);
  const unitQuantity = item.unitQuantity ?? 0;
  if (item.quantity > lot.quantity_available) {
    throw new Error(
      `Stock insuficiente del lote seleccionado: disponible ${lot.quantity_available.toLocaleString("es-AR")}`
    );
  }
  if (tracksUnits) {
    if (unitQuantity <= 0) {
      throw new Error("Ingresá la cantidad de piezas a transferir");
    }
    if (unitQuantity > (lot.unit_quantity_available ?? 0)) {
      throw new Error(
        `Unidades insuficientes del lote seleccionado: disponible ${(lot.unit_quantity_available ?? 0).toLocaleString("es-AR")}`
      );
    }
  } else if (unitQuantity !== 0) {
    throw new Error("El producto no registra piezas por separado");
  }
  return {
    source_lot_id: item.sourceLotId,
    quantity: item.quantity,
    unit_quantity: tracksUnits ? unitQuantity : 0,
  };
}

export async function createStockTransferForOrg(
  input: CreateStockTransferInput
): Promise<string> {
  const values = createStockTransferSchema.parse(input);
  const org = await getOrganizationBySlug(values.orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const auth = await requireAuth();
  if (!auth) {
    throw new Error("Usuario no autenticado");
  }

  await assertWarehouseAccess(values.orgSlug, values.sourceWarehouseId, {
    requireActive: false,
  });
  await assertWarehouseAccess(values.orgSlug, values.destinationWarehouseId, {
    requireActive: true,
  });

  const lotIds = values.items.map((item) => item.sourceLotId);
  const { data: lots, error: lotsError } = await auth.supabase
    .from("product_lots")
    .select("id, product_id, quantity_available, unit_quantity_available")
    .eq("organization_id", org.id)
    .eq("warehouse_id", values.sourceWarehouseId)
    .in("id", lotIds);
  if (lotsError) {
    throw new Error(`No se pudieron validar los lotes: ${lotsError.message}`);
  }
  const lotsById = new Map(
    ((lots ?? []) as TransferLot[]).map((lot) => [lot.id, lot])
  );

  const { data: products, error: productsError } = await auth.supabase
    .from("products")
    .select("id, unit_of_measure, tracks_stock_units")
    .eq("organization_id", org.id)
    .in("id", [
      ...new Set([...lotsById.values()].map((lot) => lot.product_id)),
    ]);
  if (productsError) {
    throw new Error(
      `No se pudieron validar los productos: ${productsError.message}`
    );
  }
  const productsById = new Map(
    ((products ?? []) as TransferProduct[]).map((product) => [
      product.id,
      product,
    ])
  );
  const items = values.items.map((item) =>
    buildTransferItem(item, lotsById, productsById)
  );

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("create_stock_transfer", {
    p_organization_id: org.id,
    p_source_warehouse_id: values.sourceWarehouseId,
    p_destination_warehouse_id: values.destinationWarehouseId,
    p_items: items as Json,
    p_reason: values.reason ?? "",
    p_actor_id: auth.userId,
  });
  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo registrar la transferencia");
  }
  return data;
}
