"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  adjustVariantStock,
  createProductLotForOrg,
  createStockMovementForOrg,
} from "@/modules/inventory/service/inventory.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  completePurchaseReceipt,
  finalizeReceivedOrderItems,
  getPurchaseReceiptById,
  getPurchaseReceiptProgress,
  type ReceiptLine,
  recordPurchaseReceipt,
  releaseReceivedOrderItems,
} from "../service/purchase-receipts.service";
import {
  prevalidatePurchaseReceiptFiscalState,
  processPurchaseReceipt,
  updatePurchaseOrderStatus,
} from "../service/purchases.service";
import type { LotInput, ReceivePurchaseActionInput } from "../types";

type ProductInfo = {
  unit_of_measure: string | null;
  tracks_stock_units: boolean | null;
  has_variants: boolean;
} | null;

async function processLotEntry(params: {
  orgSlug: string;
  productId: string;
  lotEntry: LotInput;
  product: ProductInfo;
  receiptId: string;
}) {
  const { orgSlug, productId, lotEntry, product, receiptId } = params;
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
    reason: `Recepción de compra ${receiptId} - Lote: ${lotEntry.lotNumber}`,
  });

  return lot;
}

type IncomingItem = ReceivePurchaseActionInput["receivedItems"][number];

function buildItemUpdates(items: IncomingItem[]) {
  return items.map((item) => ({
    itemId: item.itemId,
    unitQuantity: item.variantStocks
      ? 0
      : item.lots.reduce((sum, lot) => sum + lot.unitQuantity, 0),
    quantity: item.variantStocks
      ? item.variantStocks.reduce((sum, variant) => sum + variant.quantity, 0)
      : item.lots.reduce((sum, lot) => sum + lot.quantity, 0),
    unitCost: item.unitCost,
  }));
}

function buildReceiptLines(items: IncomingItem[]): ReceiptLine[] {
  return items.map((item) => {
    const update = buildItemUpdates([item])[0];
    const variantStocks: Record<string, Record<string, number>> = {};
    for (const variant of item.variantStocks ?? []) {
      variantStocks[variant.color] ??= {};
      variantStocks[variant.color][variant.talle] =
        (variantStocks[variant.color][variant.talle] ?? 0) + variant.quantity;
    }
    return {
      itemId: item.itemId,
      productId: item.productId,
      newItem: item.newItem,
      quantity: update.quantity,
      unitQuantity: update.unitQuantity,
      unitCost: item.unitCost ?? 0,
      variantStocks,
      lots: item.lots,
    };
  });
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validates received products, quantities, and variants before moving stock.
async function validatePendingReceipt(params: {
  orgSlug: string;
  orgId: string;
  purchaseOrderId: string;
  items: IncomingItem[];
}) {
  const { orgSlug, orgId, purchaseOrderId, items } = params;
  const supabase = await createClient();
  const updates = buildItemUpdates(items);
  const { data: ordered, error } = await supabase
    .from("purchase_order_items")
    .select(
      "id, product_id, quantity, unit_quantity, variant_stocks, product:products(unit_of_measure)"
    )
    .eq("organization_id", orgId)
    .eq("purchase_order_id", purchaseOrderId);
  if (error) {
    throw new Error(`No se pudo consultar el pendiente: ${error.message}`);
  }
  const byId = new Map((ordered ?? []).map((item) => [item.id, item]));
  const newProductIds = items
    .filter((item) => item.newItem)
    .map((item) => item.productId);
  const { data: newProducts, error: newProductsError } = newProductIds.length
    ? await supabase
        .from("products")
        .select("id, has_variants, unit_of_measure")
        .eq("organization_id", orgId)
        .in("id", newProductIds)
    : { data: [], error: null };
  if (newProductsError) {
    throw new Error(
      `No se pudieron verificar los productos: ${newProductsError.message}`
    );
  }
  const newProductById = new Map(
    (newProducts ?? []).map((product) => [product.id, product])
  );
  if (new Set(items.map((item) => item.itemId)).size !== items.length) {
    throw new Error("La recepción tiene ítems repetidos");
  }
  const variantIds = items.flatMap((item) =>
    (item.variantStocks ?? []).map((variant) => variant.variantId)
  );
  const { data: variants, error: variantsError } = variantIds.length
    ? await supabase
        .from("product_variants")
        .select("id, product_id, color, talle")
        .eq("organization_id", orgId)
        .in("id", variantIds)
    : { data: [], error: null };
  if (variantsError) {
    throw new Error(
      `No se pudieron validar las variantes: ${variantsError.message}`
    );
  }
  const variantById = new Map(
    (variants ?? []).map((variant) => [variant.id, variant])
  );
  for (const [index, update] of updates.entries()) {
    const line = byId.get(update.itemId);
    const source = items[index];
    const newProduct = source?.newItem
      ? newProductById.get(source.productId)
      : null;
    if (
      !source ||
      (source.newItem
        ? !newProduct ||
          line !== undefined ||
          (ordered ?? []).some(
            (existing) => existing.product_id === source.productId
          ) ||
          items.some(
            (other, otherIndex) =>
              otherIndex !== index &&
              other.newItem &&
              other.productId === source.productId
          )
        : !line || line.product_id !== source.productId) ||
      (update.quantity <= 0 && update.unitQuantity <= 0) ||
      !Number.isFinite(update.quantity) ||
      !Number.isFinite(update.unitQuantity) ||
      !Number.isFinite(update.unitCost ?? 0) ||
      (update.unitCost ?? 0) < 0
    ) {
      throw new Error("La recepción contiene productos o cantidades inválidos");
    }
    const selectedVariants = source.variantStocks ?? [];
    if (
      selectedVariants.length > 0 &&
      selectedVariants.reduce((sum, variant) => sum + variant.quantity, 0) !==
        update.quantity
    ) {
      throw new Error("La suma de variantes no coincide con lo recibido");
    }
    if (selectedVariants.length) {
      const selectedIds = new Set<string>();
      for (const selected of selectedVariants) {
        const variant = variantById.get(selected.variantId);
        if (
          !variant ||
          selectedIds.has(selected.variantId) ||
          variant.product_id !== source.productId ||
          variant.color !== selected.color ||
          variant.talle !== selected.talle ||
          !Number.isSafeInteger(selected.quantity) ||
          selected.quantity <= 0
        ) {
          throw new Error("La variante recibida no pertenece al producto");
        }
        selectedIds.add(selected.variantId);
      }
    }
  }
  const knownUpdates = updates.filter((_, index) => !items[index]?.newItem);
  if (knownUpdates.length > 0) {
    await prevalidatePurchaseReceiptFiscalState(
      orgSlug,
      purchaseOrderId,
      knownUpdates.map((item) => item.itemId),
      knownUpdates
    );
  }
}

async function processIncomingStock(params: {
  orgSlug: string;
  orgId: string;
  purchaseOrderId: string;
  receiptId: string;
  items: IncomingItem[];
}) {
  const { orgSlug, orgId, purchaseOrderId, receiptId, items } = params;
  const supabase = await createClient();
  const { data: po, error: poError } = await supabase
    .from("purchase_orders")
    .select("purchase_number")
    .eq("id", purchaseOrderId)
    .eq("organization_id", orgId)
    .single();
  if (poError || !po) {
    throw new Error("Compra no encontrada");
  }
  await Promise.all(
    items.map(async (item) => {
      const { data: product, error } = await supabase
        .from("products")
        .select("unit_of_measure, tracks_stock_units, has_variants")
        .eq("id", item.productId)
        .eq("organization_id", orgId)
        .single();
      if (error || !product) {
        throw new Error("Producto no encontrado para esta compra");
      }
      if (product.has_variants) {
        if (!item.variantStocks?.length) {
          throw new Error("Seleccioná al menos una variante para recibir");
        }
        await Promise.all(
          item.variantStocks.map((variant) =>
            adjustVariantStock({
              orgSlug,
              variantId: variant.variantId,
              type: "INBOUND",
              quantity: variant.quantity,
              reason: `Recepción de compra - Orden N${po.purchase_number} - ${receiptId}`,
            })
          )
        );
        return;
      }
      await Promise.all(
        item.lots.map((lotEntry) =>
          processLotEntry({
            orgSlug,
            productId: item.productId,
            lotEntry,
            product,
            receiptId,
          })
        )
      );
    })
  );
}

async function finalizePurchaseReceipt(
  orgSlug: string,
  orgId: string,
  purchaseOrderId: string,
  receiptId: string
) {
  const supabase = await createClient();
  const { data: purchase, error } = await supabase
    .from("purchase_orders")
    .select("status")
    .eq("id", purchaseOrderId)
    .eq("organization_id", orgId)
    .single();
  if (error || !purchase) {
    throw new Error("No se encontró la compra al finalizar la recepción");
  }
  if (purchase.status !== "RECEIVED") {
    const cumulative = await getPurchaseReceiptProgress(
      orgSlug,
      purchaseOrderId
    );
    const updates = [...cumulative]
      .filter(([, value]) => value.quantity > 0 || value.unitQuantity > 0)
      .map(([itemId, value]) => ({
        itemId,
        quantity: value.quantity,
        unitQuantity: value.unitQuantity,
        unitCost: value.unitCost,
        subtotal: value.subtotal,
        variantStocks: value.variantStocks,
      }));
    await processPurchaseReceipt(
      orgSlug,
      purchaseOrderId,
      updates.map((row) => row.itemId),
      updates
    );
    await updatePurchaseOrderStatus(orgSlug, purchaseOrderId, "RECEIVED");
  }
  await finalizeReceivedOrderItems(orgSlug, receiptId);
}

function assertValidReceiptLots(items: IncomingItem[]) {
  for (const item of items) {
    if (
      !item.variantStocks?.length &&
      (item.lots.length === 0 ||
        item.lots.some(
          (lot) =>
            !(lot.lotNumber?.trim() && lot.expirationDate) ||
            (lot.quantity <= 0 && lot.unitQuantity <= 0)
        ))
    ) {
      throw new Error(`Los lotes del producto ${item.productId} son inválidos`);
    }
  }
}

export async function receivePurchaseAction(input: ReceivePurchaseActionInput) {
  await ensure("purchases.manage", input.orgSlug);
  try {
    const {
      orgSlug,
      purchaseOrderId,
      receivedItems,
      receiptId,
      closePurchase,
    } = input;
    if (!receiptId || typeof closePurchase !== "boolean") {
      throw new Error("Falta identificar la recepción");
    }

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
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) {
      throw new Error("Usuario no autenticado");
    }

    const existingReceipt = await getPurchaseReceiptById(
      orgSlug,
      purchaseOrderId,
      receiptId
    );
    if (existingReceipt && existingReceipt.close_purchase !== closePurchase) {
      throw new Error("El cierre de esta recepción ya fue decidido");
    }
    if (!existingReceipt) {
      await validatePendingReceipt({
        orgSlug,
        orgId: org.id,
        purchaseOrderId,
        items: itemsToProcess,
      });
      assertValidReceiptLots(itemsToProcess);
      await processIncomingStock({
        orgSlug,
        orgId: org.id,
        purchaseOrderId,
        receiptId,
        items: itemsToProcess,
      });
      await recordPurchaseReceipt({
        orgSlug,
        purchaseOrderId,
        receiptId,
        lines: buildReceiptLines(itemsToProcess),
        closePurchase,
        actorId: auth.user.id,
      });
    }
    await releaseReceivedOrderItems(orgSlug, receiptId);
    if (closePurchase) {
      await finalizePurchaseReceipt(
        orgSlug,
        org.id,
        purchaseOrderId,
        receiptId
      );
      await completePurchaseReceipt(orgSlug, receiptId);
    }

    revalidatePath(`/org/${orgSlug}/compras`);
    revalidatePath(`/org/${orgSlug}/compras/${purchaseOrderId}`);
    revalidatePath(`/org/${orgSlug}/cobranzas`);
    revalidatePath(`/org/${orgSlug}/pedidos`);
    revalidatePath(`/org/${orgSlug}/compras/stock-pedidos`);

    return {
      success: true,
      message: closePurchase
        ? "Compra recibida exitosamente"
        : "Entrega registrada; la compra sigue abierta",
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

/** Finish an already recorded delivery without touching inventory again. */
export async function resumePurchaseReceiptAction(input: {
  orgSlug: string;
  purchaseOrderId: string;
  receiptId: string;
}) {
  await ensure("purchases.manage", input.orgSlug);
  try {
    const receipt = await getPurchaseReceiptById(
      input.orgSlug,
      input.purchaseOrderId,
      input.receiptId
    );
    if (!receipt) {
      throw new Error("Entrega no encontrada");
    }
    const org = await getOrganizationBySlug(input.orgSlug);
    if (!org?.id) {
      throw new Error("Organización no encontrada");
    }
    await releaseReceivedOrderItems(input.orgSlug, input.receiptId);
    if (receipt.close_purchase) {
      await finalizePurchaseReceipt(
        input.orgSlug,
        org.id,
        input.purchaseOrderId,
        input.receiptId
      );
      await completePurchaseReceipt(input.orgSlug, input.receiptId);
    }
    revalidatePath(`/org/${input.orgSlug}/compras/${input.purchaseOrderId}`);
    revalidatePath(
      `/org/${input.orgSlug}/compras/${input.purchaseOrderId}/recibir`
    );
    revalidatePath(`/org/${input.orgSlug}/compras/stock-pedidos`);
    revalidatePath(`/org/${input.orgSlug}/pedidos`);
    return { success: true as const };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Error al finalizar la entrega",
    };
  }
}
