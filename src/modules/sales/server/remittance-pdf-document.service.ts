import "server-only";

import { renderHtmlToPdfBuffer } from "@/modules/arca/server/html-to-pdf.service";
import { getOrganizationSettings } from "@/modules/organizations/actions/get-organization-settings.action";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getRemittanceFinalVisibility } from "@/modules/organizations/types/organization-settings";
import { isOrganizationModuleEnabled } from "@/modules/organizations/utils/module-flags";
import { generateRemittanceHTML } from "../service/remittance-generator.service";
import { getSalesOrderById } from "../service/sales.service";
import { renderRemittancePdfDocument } from "./remittance-pdf-renderer.service";
import { findSaleFiscalRemittance } from "./sale-fiscal-remittance.service";

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

  if (params.type === "REMITO_FINAL" && organization) {
    const fiscal = await findSaleFiscalRemittance(
      params.orgSlug,
      params.saleId,
      organization.id
    );
    if (fiscal) {
      const html = generateRemittanceHTML(fiscal);
      return {
        html,
        content: await renderHtmlToPdfBuffer(html),
        filename: `Remito_${fiscal.documentNumber}.pdf`,
        saleNumber: sale.sale_number ?? null,
      };
    }
  }

  const singlePageDuplicate =
    orgSettingsResult.success && orgSettingsResult.data
      ? orgSettingsResult.data.remittance_single_page_duplicate
      : false;
  const finalRemittanceVisibility =
    orgSettingsResult.success && orgSettingsResult.data
      ? getRemittanceFinalVisibility(orgSettingsResult.data)
      : undefined;

  return renderRemittancePdfDocument({
    sale,
    type: params.type,
    issuer: {
      businessName: organization?.name,
      cuit: organization?.cuit,
      logoUrl: organization?.logo_url,
    },
    singlePageDuplicate,
    showProductBrand:
      organization != null &&
      isOrganizationModuleEnabled(organization, "production"),
    finalRemittanceVisibility,
  });
}
