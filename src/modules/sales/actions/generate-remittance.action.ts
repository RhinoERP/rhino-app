"use server";

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
    const [sale, organization] = await Promise.all([
      getSalesOrderById(orgSlug, saleId),
      getOrganizationBySlug(orgSlug),
    ]);

    if (!sale) {
      return {
        success: false,
        error: "Venta no encontrada",
      };
    }

    const remittanceData = buildRemittanceFromSale(sale, type, {
      businessName: organization?.name,
      cuit: organization?.cuit,
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
