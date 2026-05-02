import { PosTerminal } from "@/components/pos-sales/pos-terminal";
import {
  getDirectSaleConfigByOrgSlug,
  getOrganizationBySlug,
} from "@/modules/organizations/service/organizations.service";
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

  return (
    <PosTerminal
      company={{
        name: organization?.name ?? "Empresa",
        cuit: organization?.cuit ?? "No informado",
        address: "Dirección no informada",
      }}
      directSaleConfig={directSaleConfig}
      orgSlug={orgSlug}
      taxes={taxes}
    />
  );
}
