import Link from "next/link";
import { CollectionsSectionNav } from "@/components/collections/collections-section-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { getCollectionsPageAccess } from "@/modules/collections/service/collections-access.service";
import { listMeliPaymentSales } from "@/modules/mercadolibre/service/meli-payments.service";
import { getMeliFiscalStatusLabel } from "@/modules/mercadolibre/utils/fiscal-status";
import {
  type MeliPaymentSearchParams,
  parseMeliPaymentSearchParams,
} from "@/modules/mercadolibre/utils/payment-contract";

const labels = {
  UNPAID: "Sin cobro registrado",
  PARTIAL: "Parcialmente cobrada",
  PAID: "Cobro completo",
};
const selectClass =
  "border-input bg-background h-9 rounded-md border px-3 text-sm";

export default async function MeliCollectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<MeliPaymentSearchParams>;
}) {
  const { orgSlug } = await params;
  const search = await searchParams;
  const { sections } = await getCollectionsPageAccess(orgSlug, "mercadoLibre");
  const parsed = parseMeliPaymentSearchParams(search);
  const result = parsed.success
    ? await listMeliPaymentSales(orgSlug, parsed.data)
    : null;
  function pageHref(page: number) {
    const query = new URLSearchParams();
    for (const key of [
      "view",
      "search",
      "dateFrom",
      "dateTo",
      "currency",
    ] as const) {
      if (search[key]) {
        query.set(key, search[key]);
      }
    }
    query.set("page", String(page));
    return `?${query.toString()}`;
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Cobros Meli</h1>
        <p className="text-muted-foreground text-sm">
          Registro manual de cobros brutos en Mercado Pago, vinculados a cada
          venta. Los estados reflejan las cargas realizadas en Rhino.
        </p>
      </div>
      <CollectionsSectionNav
        active="mercadoLibre"
        orgSlug={orgSlug}
        {...sections}
      />
      <form className="flex flex-wrap items-end gap-3" method="get">
        <div className="space-y-2">
          <Label htmlFor="meli-pay-view">Vista</Label>
          <select
            className={selectClass}
            defaultValue={search.view ?? "PENDING"}
            id="meli-pay-view"
            name="view"
          >
            <option value="PENDING">Sin cobro completo</option>
            <option value="ALL">Todas</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="meli-pay-search">Venta, orden o comprador</Label>
          <Input
            defaultValue={search.search ?? ""}
            id="meli-pay-search"
            maxLength={100}
            name="search"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="meli-pay-from">Venta desde</Label>
          <Input
            defaultValue={search.dateFrom ?? ""}
            id="meli-pay-from"
            name="dateFrom"
            type="date"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="meli-pay-to">Venta hasta</Label>
          <Input
            defaultValue={search.dateTo ?? ""}
            id="meli-pay-to"
            name="dateTo"
            type="date"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="meli-pay-currency">Moneda</Label>
          <select
            className={selectClass}
            defaultValue={search.currency ?? ""}
            id="meli-pay-currency"
            name="currency"
          >
            <option value="">Todas</option>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <Button type="submit">Consultar</Button>
      </form>
      {!parsed.success && (
        <p className="text-destructive text-sm" role="alert">
          Revisá la vista, moneda, búsqueda y rango de fechas.
        </p>
      )}
      {result && (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-3">Venta / orden Meli</th>
                  <th className="p-3">Fecha / comprador</th>
                  <th className="p-3">Total venta</th>
                  <th className="p-3">Bruto cobrado</th>
                  <th className="p-3">Sin cobro registrado</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3">Comprobante</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((sale) => (
                  <tr className="border-b last:border-0" key={sale.saleId}>
                    <td className="p-3">
                      <Link
                        className="font-medium hover:underline"
                        href={`/org/${orgSlug}/cobranzas/mercado-libre/${sale.saleId}`}
                      >
                        #{sale.saleNumber}
                      </Link>
                      <p>{sale.marketplaceOrderNumber}</p>
                      <p className="text-muted-foreground text-xs">
                        {sale.warehouseName}
                      </p>
                    </td>
                    <td className="p-3">
                      {formatDateOnly(sale.saleDate)}
                      <p>{sale.buyerName}</p>
                    </td>
                    <td className="p-3">
                      {formatCurrency(sale.totalAmount, sale.currency)}
                    </td>
                    <td className="p-3">
                      {formatCurrency(sale.collectedAmount, sale.currency)}
                    </td>
                    <td className="p-3">
                      {formatCurrency(sale.outstandingAmount, sale.currency)}
                    </td>
                    <td className="p-3">
                      {labels[sale.status]}
                      {sale.saleStatus === "CANCELLED" && (
                        <p className="text-muted-foreground text-xs">
                          Venta cancelada · solo historial
                        </p>
                      )}
                    </td>
                    <td className="p-3">
                      {sale.invoiceNumber ??
                        getMeliFiscalStatusLabel(sale.arcaStatus)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!result.data.length && (
              <p className="p-6 text-center text-muted-foreground">
                No hay ventas Meli para esta página y filtros.
              </p>
            )}
          </div>
          <div className="flex justify-between text-sm">
            <span>
              {result.totalCount === null
                ? "Sin resultados en esta página"
                : `${result.totalCount} ventas`}{" "}
              · página {result.filters.page}
            </span>
            <div className="flex gap-3">
              {result.filters.page > 1 && (
                <Link href={pageHref(result.filters.page - 1)}>Anterior</Link>
              )}
              {result.totalCount !== null &&
                result.filters.page * result.filters.pageSize <
                  result.totalCount && (
                  <Link href={pageHref(result.filters.page + 1)}>
                    Siguiente
                  </Link>
                )}
            </div>
          </div>
        </>
      )}
      <p className="text-muted-foreground text-sm">
        El importe sin cobro registrado no es una deuda en cuenta corriente.
        Estos importes brutos no representan el saldo neto disponible en Mercado
        Pago.
      </p>
    </div>
  );
}
