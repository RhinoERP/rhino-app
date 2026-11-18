import { format } from "date-fns";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import { getMeliCommercialReport } from "@/modules/mercadolibre/service/meli-read.service";
import { meliReportPeriodSchema } from "@/modules/mercadolibre/utils/commercial-report";

export default async function MeliReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { orgSlug } = await params;
  const search = await searchParams;
  const today = format(new Date(), "yyyy-MM-dd");
  const parsed = meliReportPeriodSchema.safeParse({
    from: search.from ?? `${today.slice(0, 7)}-01`,
    to: search.to ?? today,
  });
  const report = parsed.success
    ? await getMeliCommercialReport(orgSlug, parsed.data)
    : null;
  return (
    <div className="space-y-6">
      <Link
        className="text-sm hover:underline"
        href={`/org/${orgSlug}/venta-directa/mercado-libre`}
      >
        Volver a Mercado Libre
      </Link>
      <div>
        <h1 className="font-heading text-2xl">
          Reporte comercial · Mercado Libre
        </h1>
        <p className="text-muted-foreground text-sm">
          Ventas registradas por fecha de venta en tus depósitos asignados.
          Excluye canceladas. Importes brutos por moneda, sin mezclar con POS ni
          mayorista.
        </p>
      </div>
      <form className="flex flex-wrap items-end gap-3" method="get">
        <div className="space-y-2">
          <Label htmlFor="from">Desde</Label>
          <Input
            defaultValue={search.from ?? `${today.slice(0, 7)}-01`}
            id="from"
            name="from"
            required
            type="date"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="to">Hasta</Label>
          <Input
            defaultValue={search.to ?? today}
            id="to"
            name="to"
            required
            type="date"
          />
        </div>
        <Button type="submit">Consultar</Button>
      </form>
      {!parsed.success && (
        <p className="text-destructive text-sm" role="alert">
          Ingresá un período válido; desde debe ser anterior o igual a hasta.
        </p>
      )}
      {report && (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-3">Moneda</th>
                  <th className="p-3">Ventas</th>
                  <th className="p-3">Total con impuestos</th>
                  <th className="p-3">Impuestos</th>
                  <th className="p-3">NC autorizadas</th>
                  <th className="p-3">Ventas menos NC</th>
                  <th className="p-3">Autorizadas</th>
                  <th className="p-3">Pendientes</th>
                  <th className="p-3">Con error</th>
                  <th className="p-3">Sin emitir</th>
                </tr>
              </thead>
              <tbody>
                {report.currencies.map((row) => (
                  <tr className="border-b last:border-0" key={row.currency}>
                    <td className="p-3">{row.currency}</td>
                    <td className="p-3">{row.count}</td>
                    <td className="p-3">
                      {formatCurrency(row.total, row.currency)}
                    </td>
                    <td className="p-3">
                      {formatCurrency(row.taxes, row.currency)}
                    </td>
                    <td className="p-3">
                      {formatCurrency(row.authorizedCredits, row.currency)}
                    </td>
                    <td className="p-3">
                      {formatCurrency(row.netAfterCredits, row.currency)}
                    </td>
                    <td className="p-3">{row.authorized}</td>
                    <td className="p-3">{row.pending}</td>
                    <td className="p-3">{row.error}</td>
                    <td className="p-3">{row.notRequested}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!report.currencies.length && (
              <p className="p-6 text-center text-muted-foreground">
                No hay ventas Meli para este período.
              </p>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            Las ventas se filtran por fecha de venta y las NC por su fecha de
            emisión. Solo las NC autorizadas reducen el total; las pendientes
            reservan su importe en la factura.
          </p>
          <p className="text-muted-foreground text-sm">
            Este reporte muestra actividad comercial. No representa
            acreditaciones, saldo de Mercado Pago ni resultados contables.
          </p>
        </>
      )}
    </div>
  );
}
