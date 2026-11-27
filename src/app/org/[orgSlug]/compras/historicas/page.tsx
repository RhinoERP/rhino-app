import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HistoricalPurchasesDataTable } from "@/components/purchases/historical-purchases-data-table";
import { Button } from "@/components/ui/button";
import { parseSearchParams } from "@/lib/parse-search-params";
import { purchaseHistoryFiltersSchema } from "@/modules/purchases/historical/chess-history";
import { getPurchaseHistoryPage } from "@/modules/purchases/historical/service/chess-purchase-history.service";

export const metadata: Metadata = { title: "Compras históricas CHESS" };

export default async function HistoricalPurchasesPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{
    page?: string;
    perPage?: string;
    search?: string;
    sort?: string;
    tipo?: string;
    desde?: string;
    hasta?: string;
  }>;
}) {
  const [{ orgSlug }, query] = await Promise.all([params, searchParams]);
  const pagination = parseSearchParams(query, 20);
  const parsed = purchaseHistoryFiltersSchema.safeParse({
    search: pagination.search,
    sort: pagination.sort,
    documentCode: query.tipo,
    dateFrom: query.desde,
    dateTo: query.hasta,
  });
  if (!parsed.success) {
    return (
      <main className="space-y-4">
        <h1 className="font-heading text-2xl">Compras históricas</h1>
        <p>Revisá los filtros y el rango de fechas.</p>
        <Button asChild variant="outline">
          <Link href={`/org/${orgSlug}/compras/historicas`}>
            Limpiar filtros
          </Link>
        </Button>
      </main>
    );
  }
  const filters = parsed.data;
  const result = await getPurchaseHistoryPage(orgSlug, {
    ...filters,
    page: pagination.page,
    pageSize: pagination.pageSize,
  });
  if (!result) {
    notFound();
  }
  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-muted-foreground text-sm">Históricos / CHESS</p>
          <h1 className="font-heading text-2xl">Compras históricas</h1>
          <p className="max-w-3xl text-muted-foreground text-sm">
            Comprobantes de proveedores importados para consulta. Las órdenes de
            pago son referencias; los saldos están sin conciliar.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/org/${orgSlug}/compras`}>
            Volver a compras operativas
          </Link>
        </Button>
      </div>
      <section className="space-y-3">
        <p className="text-muted-foreground text-sm">
          {result.totalCount.toLocaleString("es-AR")} comprobantes
        </p>
        <HistoricalPurchasesDataTable
          data={result.data}
          filters={filters}
          orgSlug={orgSlug}
          pageCount={Math.max(
            1,
            Math.ceil(result.totalCount / result.pageSize)
          )}
        />
      </section>
    </main>
  );
}
