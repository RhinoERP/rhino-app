import Link from "next/link";
import { MeliFiscalAutomaticSetup } from "@/components/mercadolibre/meli-fiscal-automatic-setup";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { listMeliSales } from "@/modules/mercadolibre/service/meli-read.service";
import { getMeliFiscalStatusLabel } from "@/modules/mercadolibre/utils/fiscal-status";
import { getOrganizationLayoutData } from "@/modules/organizations/service/organizations.service";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";

export default async function MeliSalesPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { orgSlug } = await params;
  const search = await searchParams;
  const page = Math.max(
    1,
    Math.min(100_000, Number.parseInt(search.page ?? "1", 10) || 1)
  );
  const [result, layout] = await Promise.all([
    listMeliSales(orgSlug, page),
    getOrganizationLayoutData(orgSlug),
  ]);
  const canCreate = layout?.permissions.some(
    (permission) =>
      permission === "organization.admin" ||
      permission === "mercadolibre.manage"
  );
  const canReadPos = layout?.permissions.some(
    (permission) =>
      permission === "organization.admin" ||
      READ_PERMISSIONS.pos.includes(permission)
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl">Mercado Libre</h1>
          <p className="text-muted-foreground text-sm">
            Ventas por canal, sin sesión de caja ni cuenta por cobrar.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/org/${orgSlug}/venta-directa/mercado-libre/reportes`}>
              Reporte comercial
            </Link>
          </Button>
          {canReadPos && (
            <Button asChild variant="outline">
              <Link href={`/org/${orgSlug}/venta-directa`}>Venta Directa</Link>
            </Button>
          )}
          {canCreate && (
            <Button asChild>
              <Link href={`/org/${orgSlug}/venta-directa/mercado-libre/nueva`}>
                Nueva venta Meli
              </Link>
            </Button>
          )}
        </div>
      </div>
      {layout?.permissions.includes("organization.admin") && (
        <MeliFiscalAutomaticSetup
          orgId={layout.currentOrganization.id}
          orgSlug={orgSlug}
        />
      )}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-3">Venta</th>
              <th className="p-3">Orden Meli</th>
              <th className="p-3">Fecha</th>
              <th className="p-3">Comprador</th>
              <th className="p-3 text-right">Total</th>
              <th className="p-3">Factura</th>
            </tr>
          </thead>
          <tbody>
            {result.data.map((sale) => (
              <tr className="border-b last:border-0" key={sale.id}>
                <td className="p-3">
                  <Link
                    className="font-medium hover:underline"
                    href={`/org/${orgSlug}/venta-directa/mercado-libre/${sale.id}`}
                  >
                    #{sale.sale_number}
                  </Link>
                  {sale.status === "CANCELLED" && (
                    <span className="ml-2 text-muted-foreground text-xs">
                      Cancelada
                    </span>
                  )}
                </td>
                <td className="p-3">{sale.marketplace_order_number}</td>
                <td className="p-3">{formatDateOnly(sale.sale_date)}</td>
                <td className="p-3">{sale.buyerName}</td>
                <td className="p-3 text-right">
                  {formatCurrency(sale.total_amount, sale.currency)}
                </td>
                <td className="p-3">
                  {sale.invoice_number ??
                    getMeliFiscalStatusLabel(sale.arca_status)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!result.data.length && (
          <p className="p-6 text-center text-muted-foreground">
            No hay ventas Meli para los depósitos a los que tenés acceso.
          </p>
        )}
      </div>
      <div className="flex items-center justify-between text-sm">
        <span>{result.count} ventas</span>
        <div className="flex gap-3">
          {page > 1 && <Link href={`?page=${page - 1}`}>Anterior</Link>}
          {page * 20 < result.count && (
            <Link href={`?page=${page + 1}`}>Siguiente</Link>
          )}
        </div>
      </div>
    </div>
  );
}
