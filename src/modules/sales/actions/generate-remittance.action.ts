"use server";

import { getOrganizationSettings } from "@/modules/organizations/actions/get-organization-settings.action";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  buildRemittanceFromSale,
  generateRemittanceHTML,
} from "../service/remittance-generator.service";
import { getSalesOrderById } from "../service/sales.service";

type GenerateRemittanceResult = {
  success: boolean;
  html?: string;
  saleNumber?: number | null;
  error?: string;
};

/**
 * Server Action: Generate remittance HTML for a sale
 */
export async function generateRemittanceAction(
  orgSlug: string,
  saleId: string,
  type: "PRESUPUESTO" | "REMITO_FINAL"
): Promise<GenerateRemittanceResult> {
  try {
    const [sale, organization, orgSettingsResult] = await Promise.all([
      getSalesOrderById(orgSlug, saleId),
      getOrganizationBySlug(orgSlug),
      getOrganizationSettings(orgSlug),
    ]);

    if (!sale) {
      return {
        success: false,
        error: "Venta no encontrada",
      };
    }

    const singlePageDuplicate =
      orgSettingsResult.success && orgSettingsResult.data
        ? orgSettingsResult.data.remittance_single_page_duplicate
        : false;

    const remittanceData = buildRemittanceFromSale(sale, type, {
      businessName: organization?.name,
      cuit: organization?.cuit,
      singlePageDuplicate,
    });
    const html = generateRemittanceHTML(remittanceData);

    return {
      success: true,
      html,
      saleNumber: sale.sale_number,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al generar el remito",
    };
  }
}
