import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { SalesMetrics } from "@/components/sales/shared/sales-metrics";
import { Button } from "@/components/ui/button";
import {
  parseDateRangeFilter,
  parseSearchParams,
} from "@/lib/parse-search-params";
import { createClient } from "@/lib/supabase/server";
import { getOrgSellersAction } from "@/modules/organizations/actions/get-sellers.action";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  getSalesAccessContext,
  getSalesMetrics,
  getSalesPaginated,
} from "@/modules/sales/service/sales.service";
import type { InvoiceType, SalesOrderStatus } from "@/modules/sales/types";
import { SalesDataTable } from "./data-table";

function buildDateFilters(
  fecha: string | undefined,
  paginationParams: Record<string, unknown>
) {
  if (!fecha) {
    return;
  }
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 6);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  switch (fecha) {
    case "hoy":
      paginationParams.dateFrom = today;
      paginationParams.dateTo = today;
      break;
    case "ayer":
      paginationParams.dateFrom = yesterdayStr;
      paginationParams.dateTo = yesterdayStr;
      break;
    case "7dias":
      paginationParams.dateFrom = sevenDaysAgoStr;
      paginationParams.dateTo = today;
      break;
    case "mes":
      paginationParams.dateFrom = monthStart;
      paginationParams.dateTo = today;
      break;
    default:
      break;
  }
}

type SalesPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
  searchParams: Promise<{
    page?: string;
    perPage?: string;
    sort?: string;
    search?: string;
    estado?: string;
    fecha?: string;
    sellerId?: string;
    seller?: string;
    customer?: string;
    invoice_type?: string;
    sale_date?: string;
    confirmed_at?: string;
    dispatched_at?: string;
    delivered_at?: string;
    cancelled_at?: string;
    expiration_date?: string;
    anticipo?: string;
  }>;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: borderline, refactor in follow-up
export default async function SalesPage({
  params,
  searchParams,
}: SalesPageProps) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const accessContext = await getSalesAccessContext(orgSlug);

  if (!accessContext.canRead) {
    notFound();
  }

  const { page, pageSize, search, sort } = parseSearchParams(sp, 20);

  const paginationParams: Parameters<typeof getSalesPaginated>[1] = {
    page,
    pageSize,
    sort,
    search,
    invoiceType: (sp.invoice_type || undefined) as InvoiceType | undefined,
    confirmedAt: parseDateRangeFilter(sp.confirmed_at),
    dispatchedAt: parseDateRangeFilter(sp.dispatched_at),
    deliveredAt: parseDateRangeFilter(sp.delivered_at),
    cancelledAt: parseDateRangeFilter(sp.cancelled_at),
    expirationDate: parseDateRangeFilter(sp.expiration_date),
  };

  if (sp.estado && sp.estado !== "ALL") {
    paginationParams.status = sp.estado as SalesOrderStatus;
  }

  if (sp.sellerId) {
    paginationParams.sellerId = sp.sellerId;
  }

  if (sp.customer) {
    paginationParams.customerIds = sp.customer.split(",").filter(Boolean);
  }

  if (sp.seller) {
    paginationParams.sellerIds = sp.seller.split(",").filter(Boolean);
  }

  if (
    sp.anticipo === "none" ||
    sp.anticipo === "active" ||
    sp.anticipo === "settled"
  ) {
    paginationParams.advance = sp.anticipo;
  }

  buildDateFilters(sp.fecha, paginationParams as Record<string, unknown>);

  const saleDateColumn = parseDateRangeFilter(sp.sale_date);
  if (saleDateColumn?.from) {
    paginationParams.dateFrom = saleDateColumn.from;
  }
  if (saleDateColumn?.to) {
    paginationParams.dateTo = saleDateColumn.to;
  }

  const [paginated, metrics] = await Promise.all([
    getSalesPaginated(orgSlug, paginationParams),
    getSalesMetrics(orgSlug),
  ]);

  const pageCount = Math.max(1, Math.ceil(paginated.totalCount / pageSize));

  const org = await getOrganizationBySlug(orgSlug);
  const orgId = org?.id;

  let customerOptions: { value: string; label: string }[] = [];
  let sellerOptions: { value: string; label: string }[] = [];
  let carrierOptions: { value: string; label: string }[] = [];
  let supplierOptions: { value: string; label: string }[] = [];

  if (orgId) {
    const supabase = await createClient();

    const [
      { data: customerList },
      { data: carrierList },
      { data: supplierList },
    ] = await Promise.all([
      supabase
        .from("customers")
        .select("id, fantasy_name, business_name")
        .eq("organization_id", orgId)
        .order("fantasy_name"),
      supabase
        .from("carriers")
        .select("id, name")
        .eq("organization_id", orgId)
        .order("name"),
      supabase
        .from("suppliers")
        .select("id, name")
        .eq("organization_id", orgId)
        .order("name"),
    ]);

    const sellerList = await getOrgSellersAction(orgSlug);

    customerOptions = (customerList ?? []).map(
      (c: {
        id: string;
        fantasy_name?: string | null;
        business_name?: string | null;
      }) => ({
        value: c.id,
        label: c.fantasy_name || c.business_name || c.id,
      })
    );
    sellerOptions = (sellerList ?? []).map((s) => ({
      value: s.id,
      label: s.name,
    }));
    carrierOptions = (carrierList ?? []).map(
      (c: { id: string; name?: string | null }) => ({
        value: c.id,
        label: c.name ?? "",
      })
    );
    supplierOptions = (supplierList ?? []).map(
      (s: { id: string; name?: string | null }) => ({
        value: s.id,
        label: s.name ?? "",
      })
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-heading text-2xl">Ventas</h1>
          <p className="text-muted-foreground text-sm">
            {accessContext.canViewAll
              ? "Consulta todas las ventas de la organización."
              : "Consulta tus ventas registradas en la organización."}
          </p>
        </div>
        {accessContext.canManage ? (
          <Button asChild className="w-full md:w-auto">
            <Link href={`/org/${orgSlug}/preventa/nueva`}>
              <PlusIcon className="mr-2 h-4 w-4" weight="bold" />
              Nueva preventa
            </Link>
          </Button>
        ) : null}
      </div>

      <SalesMetrics metrics={metrics} orgSlug={orgSlug} />

      <Suspense
        fallback={
          <DataTableSkeleton columnCount={8} filterCount={2} rowCount={20} />
        }
      >
        <SalesDataTable
          carrierOptions={carrierOptions}
          customerOptions={customerOptions}
          initialData={paginated.data}
          orgSlug={orgSlug}
          pageCount={pageCount}
          sellerOptions={sellerOptions}
          supplierOptions={supplierOptions}
        />
      </Suspense>
    </div>
  );
}
