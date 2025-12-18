import { PreSaleForm } from "@/components/sales/pre-sale-form";
import { getCustomersByOrgSlug } from "@/modules/customers/service/customers.service";
import { getOrganizationMembersBySlug } from "@/modules/organizations/service/members.service";
import { getSaleProducts } from "@/modules/sales/service/sales.service";

type PreSalePageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function PreSalePage({ params }: PreSalePageProps) {
  const { orgSlug } = await params;

  const [customers, sellers, products] = await Promise.all([
    getCustomersByOrgSlug(orgSlug),
    getOrganizationMembersBySlug(orgSlug),
    getSaleProducts(orgSlug),
  ]);

  return (
    <PreSaleForm
      customers={customers}
      orgSlug={orgSlug}
      products={products}
      sellers={sellers}
    />
  );
}
