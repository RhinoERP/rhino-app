import { notFound } from "next/navigation";
import { PreSaleForm } from "@/components/sales/forms/pre-sale-form";
import { getCustomersByOrgSlug } from "@/modules/customers/service/customers.service";
import { getOrganizationMembersBySlug } from "@/modules/organizations/service/members.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getSaleProducts } from "@/modules/sales/service/sales.service";
import { getActiveTaxesByOrgSlug } from "@/modules/taxes/service/taxes.service";

type PreSalePageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function PreSalePage({ params }: PreSalePageProps) {
  const { orgSlug } = await params;

  const [organization, customers, sellers, products, taxes] = await Promise.all(
    [
      getOrganizationBySlug(orgSlug),
      getCustomersByOrgSlug(orgSlug),
      getOrganizationMembersBySlug(orgSlug),
      getSaleProducts(orgSlug),
      getActiveTaxesByOrgSlug(orgSlug),
    ]
  );

  if (!organization) {
    notFound();
  }

  return (
    <PreSaleForm
      customers={customers}
      organization={{ name: organization.name, cuit: organization.cuit }}
      orgSlug={orgSlug}
      products={products}
      sellers={sellers}
      taxes={taxes}
    />
  );
}
