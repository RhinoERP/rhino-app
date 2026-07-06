"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  adjustVariantStock,
  createProductLotForOrg,
  createStockMovementForOrg,
} from "@/modules/inventory/service/inventory.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  advanceLinkedChildOrderToGoodsReceived,
  processPurchaseReceipt,
  updatePurchaseOrderStatus,
} from "../service/purchases.service";
import type { LotInput, ReceivePurchaseActionInput } from "../types";

type ProductInfo = {
  unit_of_measure: string | null;
  tracks_stock_units: boolean | null;
  has_variants: boolean;
} | null;

async function processLotEntry(
  orgSlug: string,
  productId: string,
  lotEntry: LotInput,
  product: ProductInfo
) {
  if (!lotEntry.lotNumber?.trim()) {
    throw new Error(
      `Un lote del producto ${productId} requiere un número de lote`
    );
  }
  if (!lotEntry.expirationDate) {
    throw new Error(
      `Un lote del producto ${productId} requiere una fecha de vencimiento`
    );
  }
  if (lotEntry.quantity <= 0 && lotEntry.unitQuantity <= 0) {
    throw new Error(
      `Un lote del producto ${productId} debe tener una cantidad mayor a 0`
    );
  }

  const isWeightBased =
    product?.unit_of_measure === "KG" ||
    product?.unit_of_measure === "LT" ||
    product?.unit_of_measure === "MT";
  const movementQuantity = isWeightBased
    ? lotEntry.unitQuantity
    : lotEntry.quantity;
  const movementUnitQuantity =
    product?.tracks_stock_units && lotEntry.quantity > 0
      ? lotEntry.quantity
      : undefined;

  const lot = await createProductLotForOrg({
    orgSlug,
    productId,
    lotNumber: lotEntry.lotNumber,
    expirationDate: lotEntry.expirationDate,
    quantity: 0,
  });

  await createStockMovementForOrg({
    orgSlug,
    productId,
    lotId: lot.id,
    type: "INBOUND",
    quantity: movementQuantity,
    unitQuantity: movementUnitQuantity,
    reason: `Recepción de compra - Lote: ${lotEntry.lotNumber}`,
  });

  return lot;
}

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

    // Fetch purchase order number for variant reason string
    const { data: po } = await supabase
      .from("purchase_orders")
      .select("purchase_number")
      .eq("id", purchaseOrderId)
      .eq("organization_id", org.id)
      .single();
    const purchaseNumber = po?.purchase_number ?? "";

    const processPromises = itemsToProcess.map(async (item) => {
      // Get product info (has_variants, unit_of_measure, tracks_stock_units)
      const { data: product } = await supabase
        .from("products")
        .select("unit_of_measure, tracks_stock_units, has_variants")
        .eq("id", item.productId)
        .eq("organization_id", org.id)
        .single();

      // Variant products: adjust stock per variant (no lot creation)
      if (
        product?.has_variants &&
        item.variantStocks &&
        item.variantStocks.length > 0
      ) {
        const variantPromises = item.variantStocks.map((vs) =>
          adjustVariantStock({
            orgSlug,
            variantId: vs.variantId,
            type: "INBOUND",
            quantity: vs.quantity,
            reason: `Recepción de compra - Orden N${purchaseNumber}`,
          })
        );
        return Promise.all(variantPromises);
      }

      // Regular products: require at least one lot
      if (item.lots.length === 0) {
        throw new Error(
          `El producto ${item.productId} debe tener al menos un lote definido`
        );
      }

      // Create one lot + one stock movement per lot entry
      const lotPromises = item.lots.map((lotEntry) =>
        processLotEntry(orgSlug, item.productId, lotEntry, product)
      );

      return Promise.all(lotPromises);
    });

    await Promise.all(processPromises);

    // Aggregate totals per item for purchase_order_items update
    const receivedItemIds = itemsToProcess.map((item) => item.itemId);
    const itemUpdates = itemsToProcess.map((item) => {
      const totalUnitQuantity = item.variantStocks
        ? 0 // variant products are always unit-based
        : item.lots.reduce((sum, lot) => sum + lot.unitQuantity, 0);
      const totalQuantity = item.variantStocks
        ? item.variantStocks.reduce((sum, vs) => sum + vs.quantity, 0)
        : item.lots.reduce((sum, lot) => sum + lot.quantity, 0);
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

    await advanceLinkedChildOrderToGoodsReceived(
      purchaseOrderId,
      org.id,
      orgSlug
    );

    revalidatePath(`/org/${orgSlug}/compras`);
    revalidatePath(`/org/${orgSlug}/compras/${purchaseOrderId}`);
    revalidatePath(`/org/${orgSlug}/cobranzas`);
    revalidatePath(`/org/${orgSlug}/pedidos`);
    revalidatePath(`/org/${orgSlug}/compras/stock-pedidos`);

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
