"use server";

import { revalidatePath } from "next/cache";
import {
  createStockMovementForOrg,
  getProductLots,
} from "@/modules/inventory/service/inventory.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  getPurchaseOrderItemById,
  updatePurchaseOrderTaxesOnly,
  updateReceivedPurchaseOrderItems,
} from "../service/purchases.service";

export type AdjustReceiptItemInput = {
  itemId: string;
  unitQuantity?: number;
  quantity?: number;
  unitCost?: number;
};

export type AdjustPurchaseReceiptInput = {
  orgSlug: string;
  purchaseOrderId: string;
  items: AdjustReceiptItemInput[];
  taxes?: {
    tax_id: string;
    name: string;
    rate: number;
  }[];
};

async function reconcileLotStockForItem(
  orgSlug: string,
  itemId: string,
  adjustedUnitQuantity: number | undefined,
  adjustedQuantity: number | undefined
) {
  // Obtener item completo para saber product_id
  const fullItem = await getPurchaseOrderItemById(itemId);
  if (!fullItem) {
    return;
  }

  // Obtener todos los lotes para este producto
  const lots = await getProductLots(orgSlug, fullItem.product_id);
  if (lots.length === 0) {
    return;
  }

  // Obtener todos los lotes para este producto
  const lot = lots.at(-1);
  if (!lot) {
    return;
  }

  // Calcular diferencia entre item ajustado y lote actual
  const weightDelta = (adjustedUnitQuantity ?? 0) - lot.quantity_available;
  const unitDelta =
    (adjustedQuantity ?? 0) - (lot.unit_quantity_available ?? 0);

  // Si hay diferencia significativa, crear movimiento de ajuste
  if (Math.abs(weightDelta) > 0.001 || Math.abs(unitDelta) > 0.001) {
    await createStockMovementForOrg({
      orgSlug,
      productId: fullItem.product_id,
      lotId: lot.id,
      type: "ADJUSTMENT",
      quantity: weightDelta,
      unitQuantity: unitDelta,
      reason: "Ajuste de recepción de compra",
    });
  }
}

export async function adjustPurchaseReceiptAction(
  input: AdjustPurchaseReceiptInput
) {
  await ensure("purchases.manage", input.orgSlug);
  try {
    const { orgSlug, purchaseOrderId, items, taxes } = input;

    // Update items with adjusted values
    await updateReceivedPurchaseOrderItems(orgSlug, purchaseOrderId, items);

    for (const item of items) {
      await reconcileLotStockForItem(
        orgSlug,
        item.itemId,
        item.unitQuantity,
        item.quantity
      );
    }

    // Update taxes if provided
    if (taxes !== undefined) {
      await updatePurchaseOrderTaxesOnly(orgSlug, purchaseOrderId, taxes);
    }

    revalidatePath(`/org/${orgSlug}/compras/${purchaseOrderId}/recibir`);
    revalidatePath(`/org/${orgSlug}/compras`);
    revalidatePath(`/org/${orgSlug}/compras/${purchaseOrderId}`);
    revalidatePath(`/org/${orgSlug}/cobranzas`);

    return {
      success: true,
      message: "Ajustes guardados exitosamente",
      invalidatedQueryKeys: [
        ["purchases", orgSlug],
        ["purchase-order", orgSlug, purchaseOrderId],
      ] as const,
    };
  } catch (error) {
    console.error("Error adjusting receipt:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al guardar los ajustes",
    };
  }
}
