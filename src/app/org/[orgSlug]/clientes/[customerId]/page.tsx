import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerInfoCard } from "@/components/customers/customer-info-card";
import { CustomerMetricsCards } from "@/components/customers/customer-metrics-cards";
import { RecentQuotesCard } from "@/components/customers/recent-quotes-card";
import { RecentSalesCard } from "@/components/customers/recent-sales-card";
import { SupplierAssignmentsCard } from "@/components/customers/supplier-assignments-card";
import { DebitNotesCard } from "@/components/debit-notes/debit-notes-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { getCustomerCreditBalance } from "@/modules/collections/service/collections.service";
import { getAssignmentsByCustomer } from "@/modules/customer-supplier-assignments/service/assignments.service";
import { getCustomerWithStats } from "@/modules/customers/service/customers.service";
import { getDebitNotesByCustomerId } from "@/modules/debit-notes/service/debit-notes.service";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { getOrgSettings } from "@/modules/organizations/service/org-settings.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getPriceListsByOrgSlug } from "@/modules/price-lists/service/price-lists.service";
import { getQuoteMetricsAction } from "@/modules/quotes/actions/get-quote-metrics.action";
import {
  getSalesPriceListById,
  getSalesPriceListsByOrgSlug,
} from "@/modules/sales-price-lists/service/sales-price-lists.service";
import { getSuppliersByOrgSlug } from "@/modules/suppliers/service/suppliers.service";

type CustomerDetailsPageProps = {
  params: Promise<{
    orgSlug: string;
    customerId: string;
  }>;
};

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function CustomerDetailsPage({
  params,
}: CustomerDetailsPageProps) {
  const { orgSlug, customerId } = await params;
  await guardOrganizationPermissionAccess(orgSlug, [
    "customers.read",
    "customers.manage",
  ]);

  const [
    organization,
    customerWithStats,
    creditBalance,
    orgSettings,
    debitNotes,
  ] = await Promise.all([
    getOrganizationBySlug(orgSlug),
    getCustomerWithStats(orgSlug, customerId),
    getCustomerCreditBalance(orgSlug, customerId),
    getOrgSettings(orgSlug),
    getDebitNotesByCustomerId(orgSlug, customerId),
  ]);

  if (!customerWithStats) {
    notFound();
  }

  const productionEnabled = organization?.production_enabled === true;

  const quoteMetrics = productionEnabled
    ? await getQuoteMetricsAction(orgSlug, customerId)
    : null;

  const configurablePriceListsEnabled =
    orgSettings.configurable_price_lists_enabled;

  const [assignments, suppliers, priceLists, salesPriceLists] =
    configurablePriceListsEnabled
      ? await Promise.all([
          getAssignmentsByCustomer(orgSlug, customerId),
          getSuppliersByOrgSlug(orgSlug),
          getPriceListsByOrgSlug(orgSlug),
          getSalesPriceListsByOrgSlug(orgSlug),
        ])
      : [[], [], [], []];

  const { stats, recentSales, ...customer } = customerWithStats;

  const assignedPriceList = customer.sales_price_list_id
    ? await getSalesPriceListById(orgSlug, customer.sales_price_list_id)
    : null;

  const displayName = customer.fantasy_name || customer.business_name;
  const createdAt = customer.created_at
    ? dateFormatter.format(new Date(customer.created_at))
    : "-";
  const updatedAt =
    customer.updated_at && customer.updated_at !== customer.created_at
      ? dateFormatter.format(new Date(customer.updated_at))
      : null;

  const mapsLink = customer.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        customer.address + (customer.city ? `, ${customer.city}` : "")
      )}`
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/org/${orgSlug}/clientes`}>
          <Button size="sm" variant="ghost">
            <ArrowLeft className="h-4 w-4" />
            Volver a Clientes
          </Button>
        </Link>
      </div>

      {/* Mobile: Stack vertically, Desktop: Side by side */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Main Content */}
        <div className="flex-1 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h1 className="font-heading text-3xl">{displayName}</h1>
              <p className="text-muted-foreground">
                {customer.cuit ? `CUIT ${customer.cuit}` : "CUIT no informado"}
              </p>
            </div>
          </div>

          {/* Mobile: Info Card appears here (first) */}
          <div className="block lg:hidden">
            <CustomerInfoCard
              assignedPriceList={assignedPriceList}
              createdAt={createdAt}
              customer={customer}
              mapsLink={mapsLink}
              orgSlug={orgSlug}
              updatedAt={updatedAt}
            />
          </div>

          {creditBalance > 0 ? (
            <Card className="border-blue-200 bg-blue-50/40">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div className="space-y-1">
                  <CardTitle className="text-base text-blue-800">
                    Crédito a favor
                  </CardTitle>
                  <CardDescription className="text-blue-700">
                    Disponible para aplicar en próximas cobranzas
                  </CardDescription>
                </div>
                <Badge className="bg-blue-100 text-blue-800 text-lg hover:bg-blue-100">
                  {formatCurrency(creditBalance)}
                </Badge>
              </CardHeader>
            </Card>
          ) : null}

          <CustomerMetricsCards
            productionEnabled={productionEnabled}
            quoteMetrics={quoteMetrics}
            stats={stats}
          />

          {/* Presupuestos */}
          {productionEnabled && (
            <RecentQuotesCard customerId={customerId} orgSlug={orgSlug} />
          )}

          {/* Recent Sales */}
          <RecentSalesCard orgSlug={orgSlug} sales={recentSales} />

          <DebitNotesCard debitNotes={debitNotes} orgSlug={orgSlug} />

          {/* Listas por proveedor */}
          {configurablePriceListsEnabled && (
            <SupplierAssignmentsCard
              assignments={assignments}
              customerId={customerId}
              orgSlug={orgSlug}
              priceLists={priceLists}
              salesPriceLists={salesPriceLists}
              suppliers={suppliers}
            />
          )}
        </div>

        {/* Desktop: Info Card appears here (sidebar) */}
        <div className="hidden w-full lg:block lg:w-80 lg:max-w-xs xl:max-w-sm">
          <CustomerInfoCard
            assignedPriceList={assignedPriceList}
            createdAt={createdAt}
            customer={customer}
            mapsLink={mapsLink}
            orgSlug={orgSlug}
            updatedAt={updatedAt}
          />
        </div>
      </div>
    </div>
  );
}
