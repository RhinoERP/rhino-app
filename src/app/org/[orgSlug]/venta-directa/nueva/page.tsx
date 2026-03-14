import { PosTerminal } from "@/components/pos-sales/pos-terminal";
import { getCustomersByOrgSlug } from "@/modules/customers/service/customers.service";
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

  const [customers, taxes] = await Promise.all([
    getCustomersByOrgSlug(orgSlug),
    getActiveTaxesByOrgSlug(orgSlug),
  ]);

  return <PosTerminal customers={customers} orgSlug={orgSlug} taxes={taxes} />;
}
