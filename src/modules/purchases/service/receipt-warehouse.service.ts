import { requireAuth } from "@/lib/supabase/auth";
import { getAvailableWarehouses } from "@/modules/inventory/service/warehouse-stock.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { ReceiptWarehouseContext } from "../utils/receipt-warehouse";

export async function getReceiptProductVariants(
  orgSlug: string,
  productId: string
) {
  const auth = await requireAuth();
  const org = await getOrganizationBySlug(orgSlug);
  if (!(auth && org)) {
    throw new Error("Organización no disponible");
  }
  const { data, error } = await auth.supabase
    .from("product_variants")
    .select("id, talle, color")
    .eq("organization_id", org.id)
    .eq("product_id", productId)
    .eq("is_active", true)
    .order("talle")
    .order("color");
  if (error) {
    throw new Error(`No se pudieron cargar las variantes: ${error.message}`);
  }
  return data;
}

export async function getReceiptWarehouseContext(
  orgSlug: string,
  purchaseOrderId: string
): Promise<ReceiptWarehouseContext> {
  const auth = await requireAuth();
  if (!auth) {
    throw new Error("No autorizado");
  }
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    throw new Error("Organización no encontrada");
  }
  const { data: purchase, error: purchaseError } = await auth.supabase
    .from("purchase_orders")
    .select("id")
    .eq("organization_id", org.id)
    .eq("id", purchaseOrderId)
    .single();
  if (purchaseError || !purchase) {
    throw new Error("Compra no encontrada en esta organización");
  }
  const { data: orders, error: ordersError } = await auth.supabase
    .from("orders")
    .select("warehouse_id")
    .eq("organization_id", org.id)
    .eq("purchase_order_id", purchaseOrderId);
  if (ordersError) {
    throw new Error("No se pudo consultar el depósito del pedido vinculado");
  }
  const linkedWarehouseIds = [
    ...new Set(orders.map((order) => order.warehouse_id)),
  ];
  if (linkedWarehouseIds.length > 1) {
    throw new Error(
      "La compra tiene pedidos vinculados de distintos depósitos"
    );
  }
  const warehouseId = linkedWarehouseIds[0];
  const warehouses = await getAvailableWarehouses(
    orgSlug,
    warehouseId ? "wholesale" : undefined
  );
  if (!warehouseId) {
    return { warehouses, lockedWarehouse: null };
  }
  const { data: lockedWarehouse, error } = await auth.supabase
    .from("warehouses")
    .select("id, name")
    .eq("organization_id", org.id)
    .eq("id", warehouseId)
    .single();
  if (error || !lockedWarehouse) {
    throw new Error("No se pudo identificar el depósito del pedido");
  }
  return { warehouses, lockedWarehouse };
}
