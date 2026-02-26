"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createProductLotForOrg,
  createStockMovementForOrg,
} from "@/modules/inventory/service/inventory.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  processPurchaseReceipt,
  updatePurchaseOrderStatus,
} from "../service/purchases.service";

export type ReceivedItemInput = {
  itemId: string;
  productId: string;
  received: boolean;
  unitQuantity?: number;
  quantity?: number;
  expirationDate?: string;
  lotNumber?: string;
  unitCost?: number;
};

export type ReceivePurchaseInput = {
  orgSlug: string;
  purchaseOrderId: string;
  receivedItems: ReceivedItemInput[];
  invoiceType?: string;
  paymentDueDate?: string;
  totalAmount?: number;
  paymentMethod?: string;
};

export async function receivePurchaseAction(input: ReceivePurchaseInput) {
  try {
    const { orgSlug, purchaseOrderId, receivedItems } = input;

    const itemsToProcess = receivedItems.filter((item) => item.received);

    if (itemsToProcess.length === 0) {
      return {
        success: false,
        error: "Debe marcar al menos un producto como recibido",
      };
    }

    // Process inventory movements for received items
    const org = await getOrganizationBySlug(orgSlug);
    if (!org?.id) {
      return {
        success: false,
        error: "Organización no encontrada",
      };
    }

    const supabase = await createClient();

    const processPromises = itemsToProcess.map(async (item) => {
      if (!(item.lotNumber && item.expirationDate)) {
        throw new Error(
          `El producto ${item.productId} requiere número de lote y fecha de vencimiento`
        );
      }

      // Validate that either quantity or unitQuantity is greater than 0
      const hasValidQuantity =
        (item.quantity && item.quantity > 0) ||
        (item.unitQuantity && item.unitQuantity > 0);

      if (!hasValidQuantity) {
        throw new Error(
          `El producto ${item.productId} debe tener una cantidad mayor a 0`
        );
      }

      // Get product to check if it tracks stock units
      const { data: product } = await supabase
        .from("products")
        .select("unit_of_measure, tracks_stock_units")
        .eq("id", item.productId)
        .eq("organization_id", org.id)
        .single();

      // In purchase_order_items:
      // - unit_quantity = kg, lts, etc (peso/volumen)
      // - quantity = unidades (conteo de unidades)
      // For stock movements:
      // - quantity = peso/volumen en unidad base (kg/lt)
      // - unitQuantity = unidades (solo si tracks_stock_units)
      const movementQuantity = item.unitQuantity || 0; // kg/lts
      const movementUnitQuantity =
        product?.tracks_stock_units && item.quantity && item.quantity > 0
          ? item.quantity // unidades
          : undefined;

      const lot = await createProductLotForOrg({
        orgSlug,
        productId: item.productId,
        lotNumber: item.lotNumber,
        expirationDate: item.expirationDate,
        quantity: 0,
      });

      await createStockMovementForOrg({
        orgSlug,
        productId: item.productId,
        lotId: lot.id,
        type: "INBOUND",
        quantity: movementQuantity,
        unitQuantity: movementUnitQuantity,
        reason: `Recepción de compra - Lote: ${item.lotNumber}`,
      });

      return lot;
    });

    await Promise.all(processPromises);

    // Update purchase order: update received items, remove non-received items, recalculate totals
    const receivedItemIds = itemsToProcess.map((item) => item.itemId);
    const itemUpdates = itemsToProcess.map((item) => ({
      itemId: item.itemId,
      unitQuantity: item.unitQuantity,
      quantity: item.quantity,
      unitCost: item.unitCost,
    }));

    await processPurchaseReceipt(
      orgSlug,
      purchaseOrderId,
      receivedItemIds,
      itemUpdates
    );

    await updatePurchaseOrderStatus(orgSlug, purchaseOrderId, "RECEIVED");

    revalidatePath(`/org/${orgSlug}/compras`);
    revalidatePath(`/org/${orgSlug}/compras/${purchaseOrderId}`);
    revalidatePath(`/org/${orgSlug}/cobranzas`);

    return {
      success: true,
      message: "Pedido recibido exitosamente",
      invalidatedQueryKeys: [
        ["purchases", orgSlug],
        ["purchase-order", orgSlug, purchaseOrderId],
      ] as const,
    };
  } catch (error) {
    console.error("Error receiving purchase:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al recibir el pedido",
    };
  }
}
