"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationArcaSettingsByOrganizationId } from "@/modules/arca/server/repository";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { getSupplierById } from "@/modules/suppliers/service/suppliers.service";
import {
  buildItemizedTaxPlan,
  type TaxableItemLine,
} from "@/modules/taxes/item-tax-calculations";
import { getProductTaxAssignments } from "@/modules/taxes/product-tax.service";
import {
  buildPurchaseOrderPDFData,
  generatePurchaseOrderHTML,
  type PurchaseOrderPDFSource,
} from "../service/purchase-order-pdf.service";
import { getPurchaseOrderWithItems } from "../service/purchases.service";

type ItemTaxEntry = { name: string; rate: number; taxAmount: number };

type GeneratePurchaseOrderPDFResult =
  | { success: true; html: string; purchaseNumber: number | null }
  | { success: false; error: string };

async function computeItemTaxesByLine(
  orgId: string,
  items: Array<{ product_id?: string | null; subtotal?: number | null }>,
  globalDiscountAmount: number
): Promise<Map<string, ItemTaxEntry[]>> {
  const productIds = items
    .map((item) => item.product_id)
    .filter((id): id is string => Boolean(id));

  if (productIds.length === 0) {
    return new Map();
  }

  const supabase = await createClient();
  const taxesByProductId = await getProductTaxAssignments({
    supabase,
    orgId,
    productIds,
  });

  const taxableLines: TaxableItemLine[] = items.map((item, index) => ({
    lineId: String(index),
    productId: item.product_id ?? null,
    netAmount: item.subtotal ?? 0,
    taxes: item.product_id ? taxesByProductId.get(item.product_id) : undefined,
  }));

  const plan = buildItemizedTaxPlan({
    lines: taxableLines,
    globalDiscountAmount,
  });

  const result = new Map<string, ItemTaxEntry[]>();
  for (const snap of plan.itemTaxes) {
    const existing = result.get(snap.lineId) ?? [];
    existing.push({
      name: snap.name,
      rate: snap.rate,
      taxAmount: snap.taxAmount,
    });
    result.set(snap.lineId, existing);
  }

  return result;
}

export async function generatePurchaseOrderPDFAction(
  orgSlug: string,
  purchaseOrderId: string
): Promise<GeneratePurchaseOrderPDFResult> {
  await ensure("purchases.manage", orgSlug);
  try {
    const [organization, purchaseOrder] = await Promise.all([
      getOrganizationBySlug(orgSlug),
      getPurchaseOrderWithItems(orgSlug, purchaseOrderId),
    ]);

    if (!organization) {
      return { success: false, error: "Organización no encontrada" };
    }

    if (!purchaseOrder.supplier_id) {
      return {
        success: false,
        error: "La compra no tiene un proveedor asignado",
      };
    }

    const supplier = await getSupplierById(orgSlug, purchaseOrder.supplier_id);

    if (!supplier) {
      return { success: false, error: "Proveedor no encontrado" };
    }

    const arcaSettings = organization.id
      ? await getOrganizationArcaSettingsByOrganizationId(organization.id)
      : null;

    const itemTaxesByLine =
      organization.id && purchaseOrder.items?.length
        ? await computeItemTaxesByLine(
            organization.id,
            purchaseOrder.items,
            purchaseOrder.global_discount_amount ?? 0
          )
        : undefined;

    const pdfData = buildPurchaseOrderPDFData({
      purchaseOrder: purchaseOrder as PurchaseOrderPDFSource,
      supplier,
      organization,
      branding: arcaSettings
        ? {
            issuerBusinessName: arcaSettings.issuer_business_name,
            issuerLegalAddress: arcaSettings.issuer_legal_address,
            issuerLogoUrl: arcaSettings.issuer_logo_data_url,
          }
        : null,
      itemTaxesByLine,
    });

    const html = generatePurchaseOrderHTML(pdfData);

    return {
      success: true,
      html,
      purchaseNumber: purchaseOrder.purchase_number,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al generar el PDF",
    };
  }
}
