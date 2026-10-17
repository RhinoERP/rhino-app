import { createAdminClient } from "@/lib/supabase/admin-client";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import type { LotInput } from "../types";
import {
  calculateReceiptProgress,
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
    .select("id, close_purchase, order_released_at, finalized_at")
    .eq("id", receiptId)
    .eq("organization_id", org.id)
    .eq("purchase_order_id", purchaseOrderId)
    .maybeSingle();
  if (error) {
    throw new Error(`No se pudo consultar la recepción: ${error.message}`);
  }
  return data;
}

export async function getPendingPurchaseReceipt(
  orgSlug: string,
  purchaseOrderId: string
): Promise<{ id: string; closePurchase: boolean } | null> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_receipts")
    .select("id, close_purchase, order_released_at, finalized_at")
    .eq("organization_id", org.id)
    .eq("purchase_order_id", purchaseOrderId)
    .order("received_at", { ascending: true });
  if (error) {
    throw new Error(`No se pudieron consultar las entregas: ${error.message}`);
  }
  const receipts = data ?? [];
  const pending = receipts.find(
    (receipt) =>
      !receipt.order_released_at ||
      (receipt.close_purchase && !receipt.finalized_at)
  );
  return pending
    ? { id: pending.id, closePurchase: pending.close_purchase }
    : null;
}

export async function getPurchaseReceiptHistory(
  orgSlug: string,
  purchaseOrderId: string
): Promise<
  Array<{
    id: string;
    receivedAt: string;
    closePurchase: boolean;
    itemCount: number;
  }>
> {
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
      .select("receipt_id")
      .eq("organization_id", org.id)
      .eq("purchase_order_id", purchaseOrderId),
  ]);
  if (receiptsResult.error || linesResult.error) {
    throw new Error("No se pudo consultar el historial de entregas");
  }
  const counts = new Map<string, number>();
  for (const line of linesResult.data ?? []) {
    counts.set(line.receipt_id, (counts.get(line.receipt_id) ?? 0) + 1);
  }
  return (receiptsResult.data ?? []).map((receipt) => ({
    id: receipt.id,
    receivedAt: receipt.received_at,
    closePurchase: receipt.close_purchase,
    itemCount: counts.get(receipt.id) ?? 0,
  }));
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
  // The RPC becomes typed after applying the new migration in dev.
  const { data, error } = await supabase.rpc(
    "apply_atomic_purchase_receipt" as never,
    {
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
    } as never
  );
  if (error) {
    throw new Error(
      `No se pudo confirmar la entrega atómica: ${error.message}`
    );
  }
  return data as boolean;
}

export async function completePurchaseReceipt(
  orgSlug: string,
  receiptId: string
): Promise<void> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("complete_purchase_receipt", {
    p_org_id: org.id,
    p_receipt_id: receiptId,
  });
  if (error) {
    throw new Error(`No se pudo finalizar la entrega: ${error.message}`);
  }
}

export async function releaseReceivedOrderItems(
  orgSlug: string,
  receiptId: string
) {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("release_purchase_receipt_to_order", {
    p_org_id: org.id,
    p_receipt_id: receiptId,
  });
  if (error) {
    throw new Error(`No se pudo liberar el pedido recibido: ${error.message}`);
  }
}

export async function finalizeReceivedOrderItems(
  orgSlug: string,
  receiptId: string
): Promise<void> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("finalize_purchase_receipt_order", {
    p_org_id: org.id,
    p_receipt_id: receiptId,
  });
  if (error) {
    throw new Error(
      `No se pudo finalizar el pedido de compra: ${error.message}`
    );
  }
}
