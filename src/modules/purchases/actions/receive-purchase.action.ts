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
import type { ReceivePurchaseActionInput } from "../types";

export async function receivePurchaseAction(input: ReceivePurchaseActionInput) {
  try {
    const { orgSlug, purchaseOrderId, receivedItems } = input;

    const itemsToProcess = receivedItems.filter((item) => item.received);

    if (itemsToProcess.length === 0) {
      return {
        success: false,
        error: "Debe marcar al menos un producto como recibido",
      };
    }

    const org = await getOrganizationBySlug(orgSlug);
    if (!org?.id) {
      return {
        success: false,
        error: "Organización no encontrada",
      };
    }

    const supabase = await createClient();

    const processPromises = itemsToProcess.map(async (item) => {
      if (item.lots.length === 0) {
        throw new Error(
          `El producto ${item.productId} debe tener al menos un lote definido`
        );
      }

      // Get product to check if it tracks stock units
      const { data: product } = await supabase
        .from("products")
        .select("unit_of_measure, tracks_stock_units")
        .eq("id", item.productId)
        .eq("organization_id", org.id)
        .single();

      // Create one lot + one stock movement per lot entry
      const lotPromises = item.lots.map(async (lotEntry) => {
        if (!lotEntry.lotNumber?.trim()) {
          throw new Error(
            `Un lote del producto ${item.productId} requiere un número de lote`
          );
        }
        if (!lotEntry.expirationDate) {
          throw new Error(
            `Un lote del producto ${item.productId} requiere una fecha de vencimiento`
          );
        }

        const hasValidQuantity =
          lotEntry.quantity > 0 || lotEntry.unitQuantity > 0;
        if (!hasValidQuantity) {
          throw new Error(
            `Un lote del producto ${item.productId} debe tener una cantidad mayor a 0`
          );
        }

        // In purchase_order_items:
        // - unit_quantity = kg, lts, etc (peso/volumen)
        // - quantity = unidades (conteo de unidades)
        // For stock movements:
        // - quantity = peso/volumen en unidad base (kg/lt)
        // - unitQuantity = unidades (solo si tracks_stock_units)
        const movementQuantity = lotEntry.unitQuantity; // kg/lts
        const movementUnitQuantity =
          product?.tracks_stock_units && lotEntry.quantity > 0
            ? lotEntry.quantity
            : undefined;

        const lot = await createProductLotForOrg({
          orgSlug,
          productId: item.productId,
          lotNumber: lotEntry.lotNumber,
          expirationDate: lotEntry.expirationDate,
          quantity: 0,
        });

        await createStockMovementForOrg({
          orgSlug,
          productId: item.productId,
          lotId: lot.id,
          type: "INBOUND",
          quantity: movementQuantity,
          unitQuantity: movementUnitQuantity,
          reason: `Recepción de compra - Lote: ${lotEntry.lotNumber}`,
        });

        return lot;
      });

      return Promise.all(lotPromises);
    });

    await Promise.all(processPromises);

    // Aggregate totals per item for purchase_order_items update
    const receivedItemIds = itemsToProcess.map((item) => item.itemId);
    const itemUpdates = itemsToProcess.map((item) => {
      const totalUnitQuantity = item.lots.reduce(
        (sum, lot) => sum + lot.unitQuantity,
        0
      );
      const totalQuantity = item.lots.reduce(
        (sum, lot) => sum + lot.quantity,
        0
      );
      return {
        itemId: item.itemId,
        unitQuantity: totalUnitQuantity,
        quantity: totalQuantity,
        unitCost: item.unitCost,
      };
    });

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
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al recibir el pedido",
    };
  }
}
