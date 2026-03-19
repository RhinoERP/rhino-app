import { PosTerminal } from "@/components/pos-sales/pos-terminal";
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
  const taxes = await getActiveTaxesByOrgSlug(orgSlug);

  return <PosTerminal orgSlug={orgSlug} taxes={taxes} />;
}
