import { notFound } from "next/navigation";
import { PreSaleForm } from "@/components/sales/forms/pre-sale-form";
import { getCustomersByOrgSlug } from "@/modules/customers/service/customers.service";
import { getOrganizationSalesMembersBySlug } from "@/modules/organizations/service/members.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  getSaleProducts,
  getSalesAccessContext,
} from "@/modules/sales/service/sales.service";
import { getActiveTaxesByOrgSlug } from "@/modules/taxes/service/taxes.service";

type PreSalePageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function PreSalePage({ params }: PreSalePageProps) {
  const { orgSlug } = await params;
  const accessContext = await getSalesAccessContext(orgSlug);

  if (!accessContext.canManage) {
    notFound();
  }

  const [organization, customers, sellers, products, taxes] = await Promise.all(
    [
      getOrganizationBySlug(orgSlug),
      getCustomersByOrgSlug(orgSlug),
      getOrganizationSalesMembersBySlug(orgSlug),
      getSaleProducts(orgSlug),
      getActiveTaxesByOrgSlug(orgSlug),
    ]
  );

  if (!organization) {
    notFound();
  }

  const visibleCustomers = accessContext.canViewAll
    ? customers
    : customers.filter(
        (customer) => customer.assigned_seller_id === accessContext.userId
      );

  return (
    <PreSaleForm
      customers={visibleCustomers}
      initialSellerId={accessContext.userId ?? undefined}
      organization={{ name: organization.name, cuit: organization.cuit }}
      orgSlug={orgSlug}
      products={products}
      sellers={sellers}
      taxes={taxes}
    />
  );
}
