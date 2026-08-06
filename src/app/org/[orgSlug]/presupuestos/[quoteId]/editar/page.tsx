import { notFound } from "next/navigation";
import { getCustomersByOrgSlug } from "@/modules/customers/service/customers.service";
import {
  guardOrganizationModuleAccess,
  guardOrganizationPermissionAccess,
} from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
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
    "sales.read",
    "quotes.manage",
  ]);

  const [org, quote, customers, products, salesPriceLists] = await Promise.all([
    getOrganizationBySlug(orgSlug),
    getQuoteById(quoteId, orgSlug),
    getCustomersByOrgSlug(orgSlug),
    getSaleProducts(orgSlug),
    getSalesPriceListsByOrgSlug(orgSlug),
  ]);

  if (!(quote && org)) {
    notFound();
  }

  return (
    <QuoteEditWrapper
      customers={customers}
      hasProduction={org.production_enabled === true}
      orgSlug={orgSlug}
      products={products}
      quote={quote}
      salesPriceLists={salesPriceLists}
    />
  );
}
