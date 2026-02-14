import { DirectSaleForm } from "@/components/pos-sales/direct-sale-form";
import { getCustomersByOrgSlug } from "@/modules/customers/service/customers.service";
import { getOrganizationMembersBySlug } from "@/modules/organizations/service/members.service";
import { getSaleProducts } from "@/modules/sales/service/sales.service";
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

  const [customers, sellers, products, taxes] = await Promise.all([
    getCustomersByOrgSlug(orgSlug),
    getOrganizationMembersBySlug(orgSlug),
    getSaleProducts(orgSlug),
    getActiveTaxesByOrgSlug(orgSlug),
  ]);

  return (
    <DirectSaleForm
      customers={customers}
      orgSlug={orgSlug}
      products={products}
      sellers={sellers}
      taxes={taxes}
    />
  );
}
