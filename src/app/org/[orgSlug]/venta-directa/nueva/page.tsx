import { PosTerminal } from "@/components/pos-sales/pos-terminal";
import { getOrganizationArcaSettingsByOrganizationId } from "@/modules/arca/server/repository";
import {
  getDirectSaleConfigByOrgSlug,
  getOrganizationBySlug,
} from "@/modules/organizations/service/organizations.service";
import type { TicketCompanyData } from "@/modules/sales/types";
import { getActiveTaxesByOrgSlug } from "@/modules/taxes/service/taxes.service";

type DirectSaleCreatePageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function DirectSaleCreatePage({
  params,
}: DirectSaleCreatePageProps) {
  const { orgSlug } = await params;
  const [taxes, organization, directSaleConfig] = await Promise.all([
    getActiveTaxesByOrgSlug(orgSlug),
    getOrganizationBySlug(orgSlug),
    getDirectSaleConfigByOrgSlug(orgSlug),
  ]);
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
    <PosTerminal
      company={company}
      directSaleConfig={directSaleConfig}
      orgSlug={orgSlug}
      taxes={taxes}
    />
  );
}
