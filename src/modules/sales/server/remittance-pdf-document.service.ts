import "server-only";

import { getOrganizationSettings } from "@/modules/organizations/actions/get-organization-settings.action";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getRemittanceFinalVisibility } from "@/modules/organizations/types/organization-settings";
import { getSalesOrderById } from "../service/sales.service";
import { renderRemittancePdfDocument } from "./remittance-pdf-renderer.service";

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
    finalRemittanceVisibility,
  });
}
