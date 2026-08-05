import { redirect } from "next/navigation";
import { CollectionsMetrics } from "@/components/collections/collections-metrics";
import { CollectionsTabs } from "@/components/collections/collections-tabs";
import {
  parseDateRangeFilter,
  parseSearchParams,
} from "@/lib/parse-search-params";
import {
  getCollectionsData,
  getCreditOnlyCustomers,
  getPayablesMetrics,
  getPayablesPaginated,
  getReceivablesMetrics,
  getReceivablesPaginated,
} from "@/modules/collections/service/collections.service";
import type { CollectionTabValue } from "@/modules/collections/types";
import { getOrganizationLayoutData } from "@/modules/organizations/service/organizations.service";

type CollectionsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
  searchParams: Promise<{
    vista?: string;
    page?: string;
    perPage?: string;
    sort?: string;
    search?: string;
    created_at?: string;
    due_date?: string;
    dispatched_at?: string;
    customer?: string;
    supplier?: string;
    seller?: string;
    status?: string;
    cobrar?: string;
  }>;
};

function getTabFromQueryValue(value: string | null): CollectionTabValue {
  switch (value) {
    case "cxp":
      return "payables";
    case "cc-clientes":
      return "current-customers";
    case "cc-proveedores":
      return "current-suppliers";
    default:
      return "receivables";
  }
}

export default async function CollectionsPage({
  params,
  searchParams,
}: CollectionsPageProps) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const [layoutData] = await Promise.all([getOrganizationLayoutData(orgSlug)]);

  if (!layoutData) {
    redirect("/auth/login");
  }

  const wholesaleEnabled =
    layoutData.currentOrganization.wholesale_enabled ?? true;

  const availableTabs: CollectionTabValue[] = wholesaleEnabled
    ? ["receivables", "payables", "current-customers", "current-suppliers"]
    : ["payables", "current-suppliers"];

  const rawVista = sp.vista ?? null;
  const vista = getTabFromQueryValue(rawVista);
  const defaultTab = availableTabs[0];
  const currentTab = availableTabs.includes(vista) ? vista : defaultTab;

  const { page, pageSize, search, sort } = parseSearchParams(sp, 20);
  const createdAt = parseDateRangeFilter(sp.created_at);
  const dueDate = parseDateRangeFilter(sp.due_date);
  const dispatchedAt = parseDateRangeFilter(sp.dispatched_at);
  const customerIds = sp.customer
    ? sp.customer.split(",").filter(Boolean)
    : undefined;
  const supplierIds = sp.supplier
    ? sp.supplier.split(",").filter(Boolean)
    : undefined;
  const sellerIds = sp.seller
    ? sp.seller.split(",").filter(Boolean)
    : undefined;
  const statusFilter = sp.status
    ? sp.status.split(",").filter(Boolean)
    : undefined;
  const paymentAccountId = sp.cobrar || undefined;

  let paginatedData:
    | {
        data: import("@/modules/collections/types").ReceivableAccount[];
        pageCount: number;
        totalCount: number;
      }
    | {
        data: import("@/modules/collections/types").PayableAccount[];
        pageCount: number;
        totalCount: number;
      }
    | null = null;
  let fullReceivables: import("@/modules/collections/types").ReceivableAccount[] =
    [];
  let fullPayables: import("@/modules/collections/types").PayableAccount[] = [];
  let receivableCustomerIds = new Set<string>();
  let creditOnlyCustomers: Awaited<ReturnType<typeof getCreditOnlyCustomers>> =
    [];

  if (currentTab === "receivables") {
    const paginated = await getReceivablesPaginated(orgSlug, {
      page,
      pageSize,
      sort,
      search,
      createdAt,
      dueDate,
      dispatchedAt,
      customerIds,
      sellerIds,
      statusFilter,
      accountId: paymentAccountId,
    });
    const pageCount = Math.max(1, Math.ceil(paginated.totalCount / pageSize));
    paginatedData = {
      data: paginated.data,
      pageCount,
      totalCount: paginated.totalCount,
    };
    fullReceivables = paginated.data;
  } else if (currentTab === "payables") {
    const paginated = await getPayablesPaginated(orgSlug, {
      page,
      pageSize,
      sort,
      search,
      createdAt,
      dueDate,
      supplierIds,
      statusFilter,
    });
    const pageCount = Math.max(1, Math.ceil(paginated.totalCount / pageSize));
    paginatedData = {
      data: paginated.data,
      pageCount,
      totalCount: paginated.totalCount,
    };
    fullPayables = paginated.data;
  } else if (currentTab === "current-customers") {
    const collectionsData = await getCollectionsData(orgSlug);
    fullReceivables = collectionsData.receivables;
    fullPayables = collectionsData.payables;
    receivableCustomerIds = new Set(
      fullReceivables.map((r) => r.customer.id).filter(Boolean)
    );
    creditOnlyCustomers = await getCreditOnlyCustomers(
      orgSlug,
      receivableCustomerIds
    );
  } else if (currentTab === "current-suppliers") {
    const collectionsData = await getCollectionsData(orgSlug);
    fullPayables = collectionsData.payables;
  }

  const [receivablesMetrics, payablesMetrics] = await Promise.all([
    getReceivablesMetrics(orgSlug),
    getPayablesMetrics(orgSlug),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Cobranzas</h1>
          <p className="text-muted-foreground text-sm">
            Gestiona cuentas por cobrar y por pagar con pagos parciales.
          </p>
        </div>
      </div>

      <CollectionsMetrics
        payablesMetrics={payablesMetrics}
        receivablesMetrics={receivablesMetrics}
        wholesaleEnabled={wholesaleEnabled}
      />
      <CollectionsTabs
        creditOnlyCustomers={creditOnlyCustomers}
        currentTab={currentTab}
        fullPayables={fullPayables}
        fullReceivables={fullReceivables}
        orgSlug={orgSlug}
        paginatedData={paginatedData}
        paymentAccountId={paymentAccountId}
        wholesaleEnabled={wholesaleEnabled}
      />
    </div>
  );
}
