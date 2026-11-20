import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  getChessHistoricalSalesPage,
  getChessHistoricalSalesProductMetrics,
} from "@/modules/sales/historical/service/chess-historical-sales.service";

export const metadata = {
  title: "Ventas históricas CHESS",
  description: "Consulta comprobantes históricos importados desde CHESS",
};

type HistoricalSalesPageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{
    page?: string;
    q?: string;
    tipo?: string;
    desde?: string;
    hasta?: string;
  }>;
};

const documentTypeOptions = [
  { value: "FCVTA", label: "Factura" },
  { value: "PRVTA", label: "Remito / Nota de venta" },
  { value: "DVVTA", label: "Nota de crédito" },
  { value: "PRDVO", label: "Crédito de nota de venta" },
  { value: "NDCON", label: "Nota de débito" },
];

function formatDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("es-AR", {
    timeZone: "UTC",
  });
}

function formatAmount(value: number, sign: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
  }).format(Number(value) * sign);
}

function customerLabel(
  customer: {
    business_name: string | null;
    fantasy_name: string | null;
  } | null
) {
  return (
    customer?.fantasy_name || customer?.business_name || "Cliente sin vincular"
  );
}

function buildPageHref(
  orgSlug: string,
  page: number,
  filters: { q: string; tipo: string; desde: string; hasta: string }
) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (filters.q) {
    params.set("q", filters.q);
  }
  if (filters.tipo) {
    params.set("tipo", filters.tipo);
  }
  if (filters.desde) {
    params.set("desde", filters.desde);
  }
  if (filters.hasta) {
    params.set("hasta", filters.hasta);
  }
  return `/org/${orgSlug}/ventas/historicas?${params.toString()}`;
}

function documentClassLabel(documentClass: string, isFiscal: boolean) {
  let typeLabel = "Venta";
  if (documentClass === "CREDIT_NOTE") {
    typeLabel = "Nota de crédito";
  } else if (documentClass === "DEBIT_NOTE") {
    typeLabel = "Nota de débito";
  }
  return `${isFiscal ? "Fiscal" : "No fiscal"} · ${typeLabel}`;
}

function settlementLabel(status: string, cancelled: boolean) {
  if (cancelled) {
    return "Anulado";
  }
  if (status === "PAID") {
    return "Pagado";
  }
  if (status === "OPEN") {
    return "Abierto";
  }
  if (status === "PARTIAL") {
    return "Parcial";
  }
  if (status === "NOT_APPLICABLE") {
    return "No aplica";
  }
  return "Saldo sin conciliar";
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: server page combines filters, summary, and paginated document rows.
export default async function HistoricalSalesPage({
  params,
  searchParams,
}: HistoricalSalesPageProps) {
  const [{ orgSlug }, query] = await Promise.all([params, searchParams]);
  const page = Math.max(1, Number.parseInt(query.page || "1", 10) || 1);
  const filters = {
    q: query.q?.trim() || "",
    tipo: query.tipo?.trim() || "",
    desde: query.desde?.trim() || "",
    hasta: query.hasta?.trim() || "",
  };
  const [result, productMetrics] = await Promise.all([
    getChessHistoricalSalesPage(orgSlug, {
      page,
      pageSize: 50,
      search: filters.q,
      documentCode: filters.tipo || undefined,
      dateFrom: filters.desde || undefined,
      dateTo: filters.hasta || undefined,
    }),
    getChessHistoricalSalesProductMetrics(
      orgSlug,
      filters.desde || "1900-01-01",
      filters.hasta || new Date().toISOString().split("T")[0]
    ),
  ]);

  if (!(result && productMetrics)) {
    notFound();
  }

  const pageCount = Math.max(1, Math.ceil(result.totalCount / result.pageSize));

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

      <section className="rounded-lg border bg-card p-4">
        <form className="grid gap-3 md:grid-cols-5" method="get">
          <label className="space-y-1 text-sm">
            <span>Comprobante</span>
            <input
              className="h-10 w-full rounded-md border bg-background px-3"
              defaultValue={filters.q}
              name="q"
              placeholder="Número o letra"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Tipo</span>
            <select
              className="h-10 w-full rounded-md border bg-background px-3"
              defaultValue={filters.tipo}
              name="tipo"
            >
              <option value="">Todos</option>
              {documentTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Desde</span>
            <input
              className="h-10 w-full rounded-md border bg-background px-3"
              defaultValue={filters.desde}
              name="desde"
              type="date"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Hasta</span>
            <input
              className="h-10 w-full rounded-md border bg-background px-3"
              defaultValue={filters.hasta}
              name="hasta"
              type="date"
            />
          </label>
          <div className="flex items-end">
            <Button className="w-full" type="submit">
              Buscar
            </Button>
          </div>
        </form>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <div>
          <h2 className="font-semibold">Productos más vendidos</h2>
          <p className="text-muted-foreground text-sm">
            Unidades totales: bultos × unidades por bulto + unidades sueltas.
            Las notas de crédito se restan. Los importes incluyen impuestos; las
            líneas genéricas “MERCADERIA” quedan fuera del reporte por SKU.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">Artículo</th>
                <th className="py-2 text-right font-medium">Unidades netas</th>
                <th className="py-2 text-right font-medium">Importe neto</th>
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
                    {formatAmount(metric.signed_amount, 1)}
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

      <div className="flex items-center justify-between text-muted-foreground text-sm">
        <span>{result.totalCount.toLocaleString("es-AR")} comprobantes</span>
        <span>
          Página {result.page} de {pageCount}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Comprobante</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Clasificación</th>
              <th className="px-4 py-3 text-right font-medium">Importe</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {result.data.map((document) => (
              <tr className="border-t hover:bg-muted/30" key={document.id}>
                <td className="px-4 py-3">
                  {formatDate(document.document_date)}
                </td>
                <td className="px-4 py-3">
                  <Link
                    className="font-medium text-primary hover:underline"
                    href={`/org/${orgSlug}/ventas/historicas/${document.id}`}
                  >
                    {document.printed_number ||
                      `${document.document_letter} ${document.document_series}-${document.document_number}`}
                  </Link>
                  <p className="text-muted-foreground text-xs">
                    {document.document_code} · {document.document_name}
                  </p>
                </td>
                <td className="px-4 py-3">
                  {customerLabel(document.customer)}
                </td>
                <td className="px-4 py-3">
                  {documentClassLabel(
                    document.document_class,
                    document.is_fiscal
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatAmount(document.total_amount, document.revenue_sign)}
                </td>
                <td className="px-4 py-3">
                  {settlementLabel(
                    document.settlement_status,
                    document.cancelled
                  )}
                </td>
              </tr>
            ))}
            {result.data.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-10 text-center text-muted-foreground"
                  colSpan={6}
                >
                  No hay comprobantes históricos para estos filtros.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <nav
        aria-label="Paginación de ventas históricas"
        className="flex justify-between"
      >
        {result.page > 1 ? (
          <Button asChild variant="outline">
            <Link href={buildPageHref(orgSlug, result.page - 1, filters)}>
              Anterior
            </Link>
          </Button>
        ) : (
          <span />
        )}
        {result.page < pageCount ? (
          <Button asChild variant="outline">
            <Link href={buildPageHref(orgSlug, result.page + 1, filters)}>
              Siguiente
            </Link>
          </Button>
        ) : (
          <span />
        )}
      </nav>
    </main>
  );
}
