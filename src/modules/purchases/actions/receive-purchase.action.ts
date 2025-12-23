"use server";

import { revalidatePath } from "next/cache";
import {
  createProductLotForOrg,
  createStockMovementForOrg,
} from "@/modules/inventory/service/inventory.service";
import { updatePurchaseOrderStatus } from "../service/purchases.service";

export type ReceivedItemInput = {
  itemId: string;
  productId: string;
  received: boolean;
  unitQuantity?: number;
  quantity?: number;
  expirationDate?: string;
  lotNumber?: string;
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

    const processPromises = itemsToProcess.map(async (item) => {
      if (!(item.lotNumber && item.expirationDate)) {
        throw new Error(
          `El producto ${item.productId} requiere número de lote y fecha de vencimiento`
        );
      }

      if (!item.quantity || item.quantity <= 0) {
        throw new Error(
          `El producto ${item.productId} debe tener una cantidad en kg mayor a 0`
        );
      }

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
        quantity: item.quantity,
        unitQuantity:
          item.unitQuantity && item.unitQuantity > 0
            ? item.unitQuantity
            : undefined,
        reason: `Recepción de compra - Lote: ${item.lotNumber}`,
      });

      return lot;
    });

    await Promise.all(processPromises);

    await updatePurchaseOrderStatus(orgSlug, purchaseOrderId, "RECEIVED");

    revalidatePath(`/org/${orgSlug}/compras`);
    revalidatePath(`/org/${orgSlug}/compras/${purchaseOrderId}`);

    return {
      success: true,
      message: "Pedido recibido exitosamente",
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
