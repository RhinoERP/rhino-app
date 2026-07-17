import "server-only";

import { renderHtmlToPdfBuffer } from "@/modules/arca/server/html-to-pdf.service";
import { getOrganizationSettings } from "@/modules/organizations/actions/get-organization-settings.action";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  buildRemittanceFromSale,
  generateRemittanceHTML,
} from "../service/remittance-generator.service";
import { getSalesOrderById } from "../service/sales.service";

type RemittancePdfDocument = {
  filename: string;
  content: Buffer;
  html: string;
  saleNumber: number | null;
};

export async function generateRemittancePdfDocument(params: {
  orgSlug: string;
  saleId: string;
  type: "PRESUPUESTO" | "REMITO_FINAL";
}): Promise<RemittancePdfDocument> {
  const [sale, organization, orgSettingsResult] = await Promise.all([
    getSalesOrderById(params.orgSlug, params.saleId),
    getOrganizationBySlug(params.orgSlug),
    getOrganizationSettings(params.orgSlug),
  ]);

  if (!sale) {
    throw new Error("Venta no encontrada");
  }

  const singlePageDuplicate =
    orgSettingsResult.success && orgSettingsResult.data
      ? orgSettingsResult.data.remittance_single_page_duplicate
      : false;

  const remittanceData = buildRemittanceFromSale(sale, params.type, {
    businessName: organization?.name,
    cuit: organization?.cuit,
    singlePageDuplicate,
  });

  const html = generateRemittanceHTML(remittanceData);
  const content = await renderHtmlToPdfBuffer(html);

  const saleNumber = sale.sale_number ?? "sin-numero";
  const filename =
    params.type === "PRESUPUESTO"
      ? `Presupuesto_${saleNumber}.pdf`
      : `Remito_${saleNumber}.pdf`;

  return { filename, content, html, saleNumber: sale.sale_number ?? null };
}
