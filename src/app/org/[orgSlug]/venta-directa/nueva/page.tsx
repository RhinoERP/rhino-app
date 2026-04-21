import { PosTerminal } from "@/components/pos-sales/pos-terminal";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
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
  const [taxes, organization] = await Promise.all([
    getActiveTaxesByOrgSlug(orgSlug),
    getOrganizationBySlug(orgSlug),
  ]);

  return (
    <PosTerminal
      company={{
        name: organization?.name ?? "Empresa",
        cuit: organization?.cuit ?? "No informado",
        address: "Dirección no informada",
      }}
      orgSlug={orgSlug}
      taxes={taxes}
    />
  );
}
