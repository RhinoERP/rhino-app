import { notFound } from "next/navigation";
import { PreSaleForm } from "@/components/sales/forms/pre-sale-form";
import { getCustomersByOrgSlug } from "@/modules/customers/service/customers.service";
import { getOrganizationSalesMembersBySlug } from "@/modules/organizations/service/members.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { isOrganizationModuleEnabled } from "@/modules/organizations/utils/module-flags";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { getPriceLevelsByOrgSlug } from "@/modules/price-levels/service/price-levels.service";
import {
  getSaleProducts,
  getSalesAccessContext,
} from "@/modules/sales/service/sales.service";
import { resolvePreSaleCustomerContext } from "@/modules/sales/utils/pre-sale-customer-context";
import { getActiveTaxesByOrgSlug } from "@/modules/taxes/service/taxes.service";

type PreSalePageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
  searchParams: Promise<{ customerId?: string }>;
};

export default async function PreSalePage({
  params,
  searchParams,
}: PreSalePageProps) {
  const { orgSlug } = await params;
  const { customerId: requestedCustomerId } = await searchParams;
  const accessContext = await getSalesAccessContext(orgSlug);

  if (!accessContext.canManage) {
    notFound();
  }

  const [organization, customers, sellers, products, taxes, priceLevels] =
    await Promise.all([
      getOrganizationBySlug(orgSlug),
      getCustomersByOrgSlug(orgSlug),
      getOrganizationSalesMembersBySlug(orgSlug),
      getSaleProducts(orgSlug),
      getActiveTaxesByOrgSlug(orgSlug),
      getPriceLevelsByOrgSlug(orgSlug),
    ]);

  if (!organization) {
    notFound();
  }

  if (isOrganizationModuleEnabled(organization, "production")) {
    notFound();
  }

  const visibleCustomers = accessContext.canViewAll
    ? customers
    : customers.filter(
        (customer) =>
          customer.assigned_seller_id === accessContext.userId ||
          !customer.assigned_seller_id
      );

  const initialContext = resolvePreSaleCustomerContext({
    requestedCustomerId,
    visibleCustomers,
    sellers,
    userId: accessContext.userId,
    canAssignAnySeller:
      accessContext.isOrganizationAdmin || accessContext.canManageAll,
  });

  return (
    <PreSaleForm
      canReadCollections={
        READ_PERMISSIONS.collections.some((permission) =>
          accessContext.permissions.includes(permission)
        ) || accessContext.isOrganizationAdmin
      }
      customers={visibleCustomers}
      initialCustomerId={initialContext.customerId}
      initialSellerId={initialContext.sellerId}
      organization={{ name: organization.name, cuit: organization.cuit }}
      orgSlug={orgSlug}
      priceLevels={priceLevels}
      products={products}
      sellers={sellers}
      taxes={taxes}
    />
  );
}
