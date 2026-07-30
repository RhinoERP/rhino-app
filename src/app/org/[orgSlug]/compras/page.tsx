import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { PurchasesMetrics } from "@/components/purchases/shared/purchases-metrics";
import { PurchasesDataTable } from "@/components/purchases/tables/purchases-data-table";
import { Button } from "@/components/ui/button";
import {
  parseDateRangeFilter,
  parseSearchParams,
} from "@/lib/parse-search-params";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { isOrganizationModuleEnabled } from "@/modules/organizations/utils/module-flags";
import {
  getPurchaseMetrics,
  getPurchasesPaginated,
} from "@/modules/purchases/service/purchases.service";
import { getAllSuppliersForExport } from "@/modules/suppliers/service/suppliers.service";

type PurchasesPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
  searchParams: Promise<{
    page?: string;
    perPage?: string;
    sort?: string;
    search?: string;
    estado?: string;
    status?: string;
    proveedor?: string;
    supplier?: string;
    in_transit_at?: string;
    received_at?: string;
    cancelled_at?: string;
  }>;
};

export default async function PurchasesPage({
  params,
  searchParams,
}: PurchasesPageProps) {
  const { orgSlug } = await params;
  const sp = await searchParams;

  const { page, pageSize, search, sort } = parseSearchParams(sp, 20);
  const estado = sp.estado || undefined;
  const statusCol = sp.status
    ? sp.status.split(",").filter(Boolean)
    : undefined;
  const statusIds =
    statusCol ?? (estado && estado !== "ALL" ? [estado] : undefined);
  const supplierId = sp.proveedor || undefined;
  const supplierIds = sp.supplier
    ? sp.supplier.split(",").filter(Boolean)
    : undefined;
  const inTransitAt = parseDateRangeFilter(sp.in_transit_at);
  const receivedAt = parseDateRangeFilter(sp.received_at);
  const cancelledAt = parseDateRangeFilter(sp.cancelled_at);

  const [[org, _orgErr], paginated, metrics, suppliers] = await Promise.all([
    getOrganizationBySlug(orgSlug)
      .then((o) => [o, null] as const)
      .catch((e) => [null, e] as const),
    getPurchasesPaginated(orgSlug, {
      page,
      pageSize,
      sort,
      search,
      estado,
      statusIds,
      supplierId,
      supplierIds,
      inTransitAt,
      receivedAt,
      cancelledAt,
    }),
    getPurchaseMetrics(orgSlug),
    getAllSuppliersForExport(orgSlug),
  ]);

  const showPrePurchasesTab = org
    ? isOrganizationModuleEnabled(org, "production")
    : false;

  const pageCount = Math.max(1, Math.ceil(paginated.totalCount / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Compras</h1>
          <p className="text-muted-foreground text-sm">
            Consulta todas las compras de la organización.
          </p>
        </div>
        <Button asChild>
          <Link href={`/org/${orgSlug}/compras/nueva`}>
            <PlusIcon className="mr-2 h-4 w-4" weight="bold" />
            Nueva compra
          </Link>
        </Button>
      </div>

      <PurchasesMetrics metrics={metrics} />

      <PurchasesDataTable
        data={paginated.data}
        orgSlug={orgSlug}
        pageCount={pageCount}
        showPrePurchasesTab={showPrePurchasesTab}
        suppliers={suppliers}
      />
    </div>
  );
}
