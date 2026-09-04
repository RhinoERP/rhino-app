import { notFound } from "next/navigation";
import { getQuoteCustomersByOrgSlug } from "@/modules/customers/service/customers.service";
import {
  guardOrganizationModuleAccess,
  guardOrganizationPermissionAccess,
} from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { getPriceLevelsByOrgSlug } from "@/modules/price-levels/service/price-levels.service";
import { getQuoteById } from "@/modules/quotes/actions/get-quote-by-id.action";
import { getSaleProducts } from "@/modules/sales/service/sales.service";
import { getSalesPriceListsByOrgSlug } from "@/modules/sales-price-lists/service/sales-price-lists.service";
import { QuoteEditWrapper } from "./quote-edit-wrapper";

type QuoteEditPageProps = {
  params: Promise<{ orgSlug: string; quoteId: string }>;
};

export default async function QuoteEditPage({ params }: QuoteEditPageProps) {
  const { orgSlug, quoteId } = await params;

  await guardOrganizationModuleAccess(orgSlug, "production");
  await guardOrganizationPermissionAccess(orgSlug, [
    ...READ_PERMISSIONS.sales,
    "quotes.manage",
    "quotes.manage.all",
  ]);

  const [org, quote, customers, products, salesPriceLists, priceLevels] =
    await Promise.all([
      getOrganizationBySlug(orgSlug),
      getQuoteById(quoteId, orgSlug),
      getQuoteCustomersByOrgSlug(orgSlug),
      getSaleProducts(orgSlug),
      getSalesPriceListsByOrgSlug(orgSlug),
      getPriceLevelsByOrgSlug(orgSlug),
    ]);

  if (!(quote && org)) {
    notFound();
  }

  return (
    <QuoteEditWrapper
      customers={customers}
      hasProduction={org.production_enabled === true}
      orgSlug={orgSlug}
      priceLevels={priceLevels}
      products={products}
      quote={quote}
      salesPriceLists={salesPriceLists}
    />
  );
}
