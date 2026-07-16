import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SalesMetrics } from "@/components/sales/shared/sales-metrics";
import { Button } from "@/components/ui/button";
import {
  getSalesAccessContext,
  getSalesMetrics,
  getSalesPaginated,
} from "@/modules/sales/service/sales.service";
import type { SalesOrderStatus, SortParam } from "@/modules/sales/types";
import { SalesDataTable } from "./data-table";

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
  }>;
};

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

  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(sp.perPage) || 20));
  const search = sp.search || undefined;

  let sort: SortParam[] | undefined;
  if (sp.sort) {
    try {
      sort = JSON.parse(sp.sort);
    } catch {
      sort = undefined;
    }
  }

  const paginationParams: Parameters<typeof getSalesPaginated>[1] = {
    page,
    pageSize,
    sort,
    search,
  };

  if (sp.estado && sp.estado !== "ALL") {
    paginationParams.status = sp.estado as SalesOrderStatus;
  }

  if (sp.sellerId) {
    paginationParams.sellerId = sp.sellerId;
  }

  if (sp.fecha) {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 6);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    switch (sp.fecha) {
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

  const [paginated, metrics] = await Promise.all([
    getSalesPaginated(orgSlug, paginationParams),
    getSalesMetrics(orgSlug),
  ]);

  const pageCount = Math.max(1, Math.ceil(paginated.totalCount / pageSize));

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

      <SalesMetrics metrics={metrics} />

      <Suspense fallback={<div>Cargando...</div>}>
        <SalesDataTable
          initialData={paginated.data}
          orgSlug={orgSlug}
          pageCount={pageCount}
        />
      </Suspense>
    </div>
  );
}
