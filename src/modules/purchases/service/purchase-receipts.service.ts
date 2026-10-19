import { createAdminClient } from "@/lib/supabase/admin-client";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import type { LotInput } from "../types";
import {
  calculateReceiptProgress,
  groupReceiptItems,
  type ReceivedProgress,
  type VariantQuantities,
} from "../utils/receipt-progress";

function readVariantQuantities(value: unknown): VariantQuantities {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).map(([color, sizes]) => [
      color,
      sizes && typeof sizes === "object" && !Array.isArray(sizes)
        ? Object.fromEntries(
            Object.entries(sizes).filter(
              (entry): entry is [string, number] => typeof entry[1] === "number"
            )
          )
        : {},
    ])
  );
}

export type ReceiptLine = {
  itemId: string;
  productId: string;
  newItem?: boolean;
  quantity: number;
  unitQuantity: number;
  unitCost: number;
  variantStocks: Record<string, Record<string, number>>;
  lots: LotInput[];
};

export async function hasRegisteredPurchaseInvoice(
  orgSlug: string,
  purchaseOrderId: string
): Promise<boolean> {
  await ensure(READ_PERMISSIONS.purchases, orgSlug);
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  // The invoice may belong to another operator; the current user's invoice
  // RLS cannot answer whether a purchase order has been invoiced.
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("supplier_invoices")
    .select("id")
    .eq("organization_id", org.id)
    .eq("purchase_order_id", purchaseOrderId)
    .eq("status", "REGISTERED")
    .limit(1);
  if (error) {
    throw new Error(`No se pudo consultar la factura: ${error.message}`);
  }
  return (data?.length ?? 0) > 0;
}

/** Compare physical receipts with the frozen ordered quantities/variants. */
export async function getPurchaseReceiptMismatch(
  orgSlug: string,
  purchaseOrderId: string
): Promise<boolean> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const supabase = createAdminClient();
  const [baselineResult, receivedResult] = await Promise.all([
    supabase
      .from("purchase_receipt_ordered_items")
      .select("id, quantity, unit_quantity, variant_stocks")
      .eq("organization_id", org.id)
      .eq("purchase_order_id", purchaseOrderId),
    supabase
      .from("purchase_receipt_items")
      .select(
        "purchase_order_item_id, quantity, unit_quantity, variant_stocks, is_extra"
      )
      .eq("organization_id", org.id)
      .eq("purchase_order_id", purchaseOrderId),
  ]);
  if (baselineResult.error || receivedResult.error) {
    throw new Error("No se pudo comparar la recepción con la OC original");
  }
  const baseline = baselineResult.data ?? [];
  const received = receivedResult.data ?? [];
  if (received.some((line) => line.is_extra)) {
    return true;
  }
  return baseline.some((ordered) => {
    const matching = received.filter(
      (line) => line.purchase_order_item_id === ordered.id
    );
    if (
      matching.reduce((sum, line) => sum + line.quantity, 0) !==
        ordered.quantity ||
      matching.reduce((sum, line) => sum + line.unit_quantity, 0) !==
        (ordered.unit_quantity ?? 0)
    ) {
      return true;
    }
    const variants = readVariantQuantities(ordered.variant_stocks);
    return (
      Object.entries(variants).some(([color, sizes]) =>
        Object.entries(sizes).some(
          ([size, count]) =>
            matching.reduce(
              (sum, line) =>
                sum +
                (readVariantQuantities(line.variant_stocks)[color]?.[size] ??
                  0),
              0
            ) !== count
        )
      ) ||
      matching.some((line) =>
        Object.entries(readVariantQuantities(line.variant_stocks)).some(
          ([color, sizes]) =>
            Object.entries(sizes).some(
              ([size, count]) => count > 0 && !(size in (variants[color] ?? {}))
            )
        )
      )
    );
  });
}

export async function getPurchaseReceiptProgress(
  orgSlug: string,
  purchaseOrderId: string
): Promise<Map<string, ReceivedProgress>> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_receipt_items")
    .select(
      "purchase_order_item_id, quantity, unit_quantity, unit_cost, variant_stocks"
    )
    .eq("organization_id", org.id)
    .eq("purchase_order_id", purchaseOrderId);
  if (error) {
    throw new Error(
      `No se pudieron consultar las recepciones: ${error.message}`
    );
  }
  return calculateReceiptProgress(
    (data ?? []).map((line) => ({
      ...line,
      variant_stocks: readVariantQuantities(line.variant_stocks),
    }))
  );
}

export async function getPurchaseReceiptById(
  orgSlug: string,
  purchaseOrderId: string,
  receiptId: string
) {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_receipts")
    .select("id, close_purchase")
    .eq("id", receiptId)
    .eq("organization_id", org.id)
    .eq("purchase_order_id", purchaseOrderId)
    .maybeSingle();
  if (error) {
    throw new Error(`No se pudo consultar la recepción: ${error.message}`);
  }
  return data;
}

export type PurchaseReceiptHistoryItem = {
  purchaseOrderItemId: string;
  productId: string;
  isExtra: boolean;
  quantity: number;
  unitQuantity: number;
  variantStocks: VariantQuantities;
};

export type PurchaseReceiptHistoryEntry = {
  id: string;
  receivedAt: string;
  closePurchase: boolean;
  itemCount: number;
  items: PurchaseReceiptHistoryItem[];
};

export async function getPurchaseReceiptHistory(
  orgSlug: string,
  purchaseOrderId: string
): Promise<PurchaseReceiptHistoryEntry[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const supabase = await createClient();
  const [receiptsResult, linesResult] = await Promise.all([
    supabase
      .from("purchase_receipts")
      .select("id, received_at, close_purchase")
      .eq("organization_id", org.id)
      .eq("purchase_order_id", purchaseOrderId)
      .order("received_at", { ascending: true }),
    supabase
      .from("purchase_receipt_items")
      .select(
        "receipt_id, purchase_order_item_id, product_id, is_extra, quantity, unit_quantity, variant_stocks"
      )
      .eq("organization_id", org.id)
      .eq("purchase_order_id", purchaseOrderId),
  ]);
  if (receiptsResult.error || linesResult.error) {
    throw new Error("No se pudo consultar el historial de entregas");
  }
  const grouped = groupReceiptItems(linesResult.data ?? []);
  return (receiptsResult.data ?? []).map((receipt) => {
    const items = (grouped.get(receipt.id) ?? []).map((line) => ({
      purchaseOrderItemId: line.purchase_order_item_id,
      productId: line.product_id,
      isExtra: line.is_extra,
      quantity: line.quantity,
      unitQuantity: line.unit_quantity,
      variantStocks: readVariantQuantities(line.variant_stocks),
    }));
    return {
      id: receipt.id,
      receivedAt: receipt.received_at,
      closePurchase: receipt.close_purchase,
      itemCount: items.length,
      items,
    };
  });
}

export async function applyAtomicPurchaseReceipt(params: {
  orgSlug: string;
  purchaseOrderId: string;
  receiptId: string;
  lines: ReceiptLine[];
  closePurchase: boolean;
  actorId: string;
  fiscal: Record<string, unknown> | null;
}): Promise<boolean> {
  const org = await getOrganizationBySlug(params.orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("apply_atomic_purchase_receipt", {
    p_org_id: org.id,
    p_purchase_order_id: params.purchaseOrderId,
    p_receipt_id: params.receiptId,
    p_close: params.closePurchase,
    p_fiscal: params.fiscal,
    p_items: params.lines.map((line) => ({
      item_id: line.itemId,
      new_item: line.newItem ?? false,
      actor_id: params.actorId,
      product_id: line.productId,
      quantity: line.quantity,
      unit_quantity: line.unitQuantity,
      unit_cost: line.unitCost,
      variant_stocks: line.variantStocks,
      lots: line.lots,
    })),
  });
  if (error) {
    throw new Error(
      `No se pudo confirmar la entrega atómica: ${error.message}`
    );
  }
  return data as boolean;
}
