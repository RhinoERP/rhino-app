import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HistoricalSalesDataTable } from "@/components/sales/historical-sales-data-table";
import { Button } from "@/components/ui/button";
import { parseSearchParams } from "@/lib/parse-search-params";
import {
  getChessHistoricalSalesPage,
  getChessHistoricalSalesProductMetrics,
} from "@/modules/sales/historical/service/chess-historical-sales.service";

export const metadata: Metadata = {
  title: "Ventas históricas CHESS",
  description: "Consulta comprobantes históricos importados desde CHESS",
};

type HistoricalSalesPageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{
    page?: string;
    perPage?: string;
    sort?: string;
    search?: string;
    tipo?: string;
    desde?: string;
    hasta?: string;
  }>;
};

function formatAmount(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
  }).format(Number(value));
}

export default async function HistoricalSalesPage({
  params,
  searchParams,
}: HistoricalSalesPageProps) {
  const [{ orgSlug }, query] = await Promise.all([params, searchParams]);
  const pagination = parseSearchParams(query, 20);
  const dateFrom = query.desde?.trim() || undefined;
  const dateTo = query.hasta?.trim() || undefined;
  const documentCode = query.tipo?.trim() || undefined;

  const [pageResult, productMetrics] = await Promise.all([
    getChessHistoricalSalesPage(orgSlug, {
      ...pagination,
      documentCode,
      dateFrom,
      dateTo,
    })
      .then((data) => ({ data }))
      .catch((error: unknown) => ({ error })),
    getChessHistoricalSalesProductMetrics(
      orgSlug,
      dateFrom || "1900-01-01",
      dateTo || new Date().toISOString().split("T")[0],
      5
    ),
  ]);

  const searchFailed =
    "error" in pageResult && Boolean(pagination.search?.trim());
  if (searchFailed) {
    console.error(
      "No se pudo buscar en ventas históricas CHESS:",
      pageResult.error
    );
  } else if ("error" in pageResult) {
    throw pageResult.error;
  }

  const result = "data" in pageResult ? pageResult.data : null;
  if (!(productMetrics && (searchFailed || result))) {
    notFound();
  }
  const pageData = result ?? {
    data: [],
    totalCount: 0,
    page: pagination.page,
    pageSize: pagination.pageSize,
  };

  return (
    <main className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-muted-foreground text-sm">Ventas / CHESS</p>
          <h1 className="font-heading text-2xl">Ventas históricas</h1>
          <p className="max-w-3xl text-muted-foreground text-sm">
            Comprobantes importados para consulta y análisis. Son de solo
            lectura: no generan stock, facturación ARCA ni cuentas por cobrar.
            El estado de pago se muestra como no conciliado hasta vincular
            recibos y saldos.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/org/${orgSlug}/ventas`}>
            Volver a ventas operativas
          </Link>
        </Button>
      </div>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <div>
          <h2 className="font-semibold">Productos más vendidos</h2>
          <p className="text-muted-foreground text-sm">
            Cinco productos principales por importe, con notas de crédito
            restadas. Las líneas genéricas “MERCADERIA” no se asignan a un SKU.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">Artículo</th>
                <th className="py-2 text-right font-medium">Unidades netas</th>
                <th className="py-2 text-right font-medium">Importe</th>
                <th className="py-2 text-right font-medium">Comprobantes</th>
              </tr>
            </thead>
            <tbody>
              {productMetrics.map((metric) => (
                <tr className="border-t" key={metric.product_chess_code}>
                  <td className="py-2">
                    <span className="font-medium">{metric.product_name}</span>
                    <span className="ml-2 text-muted-foreground text-xs">
                      {metric.product_chess_code}
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {metric.signed_quantity == null
                      ? "Sin presentación"
                      : Number(metric.signed_quantity).toLocaleString("es-AR")}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatAmount(metric.signed_amount)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {Number(metric.document_count).toLocaleString("es-AR")}
                  </td>
                </tr>
              ))}
              {productMetrics.length === 0 ? (
                <tr>
                  <td
                    className="py-5 text-center text-muted-foreground"
                    colSpan={4}
                  >
                    Todavía no hay líneas de productos históricas para este
                    período.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        {searchFailed ? (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
            role="alert"
          >
            <p className="text-sm">
              No pudimos realizar la búsqueda. Probá con otro nombre o número de
              comprobante.
            </p>
            <Button asChild variant="outline">
              <Link href={`/org/${orgSlug}/ventas/historicas`}>
                Limpiar búsqueda
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="text-muted-foreground text-sm">
              {pageData.totalCount.toLocaleString("es-AR")} comprobantes
            </div>
            <HistoricalSalesDataTable
              data={pageData.data}
              orgSlug={orgSlug}
              pageCount={Math.max(
                1,
                Math.ceil(pageData.totalCount / pageData.pageSize)
              )}
            />
          </>
        )}
      </section>
    </main>
  );
}
