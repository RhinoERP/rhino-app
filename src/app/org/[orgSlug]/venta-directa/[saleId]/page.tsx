import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { DirectSaleDetail } from "@/components/pos-sales/direct-sale-detail";
import { getOrganizationArcaSettingsByOrganizationId } from "@/modules/arca/server/repository";
import {
  getDirectSaleConfigByOrgSlug,
  getOrganizationBySlug,
} from "@/modules/organizations/service/organizations.service";
import { getDirectSaleById } from "@/modules/sales/service/direct-sales.service";
import type { TicketCompanyData } from "@/modules/sales/types";

type DirectSaleDetailPageProps = {
  params: Promise<{
    orgSlug: string;
    saleId: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function DirectSaleDetailPage({
  params,
}: DirectSaleDetailPageProps) {
  noStore();

  const { orgSlug, saleId } = await params;
  const [sale, organization, directSaleConfig] = await Promise.all([
    getDirectSaleById(orgSlug, saleId),
    getOrganizationBySlug(orgSlug),
    getDirectSaleConfigByOrgSlug(orgSlug),
  ]);

  if (!sale) {
    notFound();
  }
  const arcaSettings = organization?.id
    ? await getOrganizationArcaSettingsByOrganizationId(organization.id)
    : null;
  const extendedArcaSettings = arcaSettings as
    | (NonNullable<typeof arcaSettings> & {
        issuer_vat_condition?: string | null;
        issuer_gross_income_number?: string | null;
        issuer_activity_start_date?: string | null;
      })
    | null;
  const company: TicketCompanyData = {
    name:
      arcaSettings?.issuer_business_name?.trim() ||
      organization?.name ||
      "Empresa",
    cuit: organization?.cuit ?? "No informado",
    address: arcaSettings?.issuer_legal_address ?? "Dirección no informada",
    vatCondition: extendedArcaSettings?.issuer_vat_condition ?? null,
    grossIncomeNumber: extendedArcaSettings?.issuer_gross_income_number ?? null,
    activityStartDate: extendedArcaSettings?.issuer_activity_start_date ?? null,
  };

  return (
    <DirectSaleDetail
      company={company}
      directSaleDefaultInvoiceType={directSaleConfig.sales_default_invoice_type}
      orgSlug={orgSlug}
      posArcaInvoiceType={
        directSaleConfig.sales_default_invoice_type === "FACTURA_B" ||
        directSaleConfig.sales_default_invoice_type === "FACTURA_C"
          ? directSaleConfig.sales_default_invoice_type
          : null
      }
      sale={sale}
    />
  );
}
