import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HistoricalPurchasesDataTable } from "@/components/purchases/historical-purchases-data-table";
import { Button } from "@/components/ui/button";
import { parseSearchParams } from "@/lib/parse-search-params";
import {
  historyAmount,
  purchaseHistoryFiltersSchema,
} from "@/modules/purchases/historical/chess-history";
import {
  getPurchaseHistoryMetrics,
  getPurchaseHistoryPage,
} from "@/modules/purchases/historical/service/chess-purchase-history.service";

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
  const [result, metrics] = await Promise.all([
    getPurchaseHistoryPage(orgSlug, {
      ...filters,
      page: pagination.page,
      pageSize: pagination.pageSize,
    }),
    getPurchaseHistoryMetrics(orgSlug, filters),
  ]);
  if (!(result && metrics)) {
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
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-muted-foreground text-sm">Comprobantes</p>
          <p className="font-semibold text-xl">
            {Number(metrics.document_count).toLocaleString("es-AR")}
          </p>
        </div>
        {metrics.totals.map((total) => (
          <div className="rounded-lg border bg-card p-4" key={total.currency}>
            <p className="text-muted-foreground text-sm">
              Compras netas · {total.currency}
            </p>
            <p className="font-semibold text-xl">
              {historyAmount(total.net_purchases, total.currency)}
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              FC + ND + ME − NC. No incluye MI.
            </p>
          </div>
        ))}
      </section>
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="font-semibold">Productos más comprados</h2>
        <p className="text-muted-foreground text-sm">
          Cinco productos por neto de línea, con NC restadas y MI excluidas.
          Cantidades convertidas con la presentación del maestro CHESS del
          piloto.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr>
                <th className="py-2">Artículo</th>
                <th className="py-2 text-right">Unidades netas</th>
                <th className="py-2 text-right">Neto de líneas</th>
                <th className="py-2 text-right">Comprobantes</th>
              </tr>
            </thead>
            <tbody>
              {metrics.products.map((product) => (
                <tr className="border-t" key={product.product_chess_code}>
                  <td className="py-2">
                    {product.product_name}
                    <span className="ml-2 text-muted-foreground">
                      {product.product_chess_code}
                    </span>
                  </td>
                  <td className="text-right">
                    {product.signed_quantity == null
                      ? "Sin presentación"
                      : Number(product.signed_quantity).toLocaleString("es-AR")}
                  </td>
                  <td className="text-right">
                    {historyAmount(product.signed_net_amount)}
                  </td>
                  <td className="text-right">{product.document_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {metrics.products.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No hay artículos para estos filtros.
          </p>
        ) : null}
      </section>
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
