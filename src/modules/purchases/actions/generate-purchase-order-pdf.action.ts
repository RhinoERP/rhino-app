"use server";

import { getOrganizationArcaSettingsByOrganizationId } from "@/modules/arca/server/repository";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { getSupplierById } from "@/modules/suppliers/service/suppliers.service";
import {
  buildPurchaseOrderPDFData,
  generatePurchaseOrderHTML,
  type PurchaseOrderPDFSource,
} from "../service/purchase-order-pdf.service";
import { getPurchaseOrderWithItems } from "../service/purchases.service";

type GeneratePurchaseOrderPDFResult =
  | { success: true; html: string; purchaseNumber: number | null }
  | { success: false; error: string };

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
