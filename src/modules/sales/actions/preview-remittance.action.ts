"use server";

import { getOrganizationSettings } from "@/modules/organizations/actions/get-organization-settings.action";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getRemittanceFinalVisibility } from "@/modules/organizations/types/organization-settings";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  buildRemittanceFromSale,
  generateRemittanceHTML,
} from "../service/remittance-generator.service";
import { getSalesOrderById } from "../service/sales.service";

type PreviewRemittanceResult =
  | { success: true; html: string }
  | { success: false; error: string };

/**
 * Server Action: Generate remittance HTML for preview only
 * No Puppeteer, no upload — just the HTML string for an iframe preview.
 */
export async function previewRemittanceAction(
  orgSlug: string,
  saleId: string,
  type: "PRESUPUESTO" | "REMITO_FINAL"
): Promise<PreviewRemittanceResult> {
  await ensure(READ_PERMISSIONS.sales, orgSlug);
  try {
    const [sale, organization, orgSettingsResult] = await Promise.all([
      getSalesOrderById(orgSlug, saleId),
      getOrganizationBySlug(orgSlug),
      getOrganizationSettings(orgSlug),
    ]);

    if (!sale) {
      return { success: false, error: "Venta no encontrada" };
    }

    const singlePageDuplicate =
      orgSettingsResult.success && orgSettingsResult.data
        ? orgSettingsResult.data.remittance_single_page_duplicate
        : false;
    const finalRemittanceVisibility =
      orgSettingsResult.success && orgSettingsResult.data
        ? getRemittanceFinalVisibility(orgSettingsResult.data)
        : undefined;

    const remittanceData = buildRemittanceFromSale(sale, type, {
      businessName: organization?.name,
      cuit: organization?.cuit,
      singlePageDuplicate,
      finalRemittanceVisibility,
    });

    const html = generateRemittanceHTML(remittanceData);

    return { success: true, html };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al generar la vista previa",
    };
  }
}
