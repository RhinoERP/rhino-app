import { format } from "date-fns";
import { es } from "date-fns/locale";
import { AdvanceReceiptDialog } from "@/components/sale-advances/advance-receipt-dialog";
import { NewAdvanceDialog } from "@/components/sale-advances/new-advance-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSaleAdvancesAction } from "@/modules/sale-advances/actions/sale-advances.actions";
import type { AdvanceStatus } from "@/modules/sale-advances/types";

type AnticiposPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});

const STATUS_LABELS: Record<AdvanceStatus, string> = {
  pending: "Pendiente de cobro",
  collected: "Cobrado",
  credited: "Acreditado (NC)",
};

const STATUS_VARIANTS: Record<
  AdvanceStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "default",
  collected: "secondary",
  credited: "outline",
};

export default async function AnticiposPage({ params }: AnticiposPageProps) {
  const { orgSlug } = await params;
  const advances = await getSaleAdvancesAction(orgSlug);

  const pending = advances.filter((a) => a.status === "pending");
  const collected = advances.filter((a) => a.status === "collected");
  const credited = advances.filter((a) => a.status === "credited");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Anticipos</h1>
          <p className="text-muted-foreground text-sm">
            Facturas de anticipo emitidas. Cada anticipo se cobra y luego se
            acredita con una Nota de Crédito al facturar el pedido completo.
          </p>
        </div>
        <NewAdvanceDialog orgSlug={orgSlug} />
      </div>

      {/* Métricas rápidas */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Pendientes de cobro</p>
          <p className="text-2xl font-semibold tabular-nums">
            {pending.length}
          </p>
          <p className="text-xs text-muted-foreground mt-1 tabular-nums">
            {currencyFormatter.format(
              pending.reduce((s, a) => s + a.total_amount, 0)
            )}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Cobrados (sin NC)</p>
          <p className="text-2xl font-semibold tabular-nums">
            {collected.length}
          </p>
          <p className="text-xs text-amber-600 mt-1 font-medium">
            {collected.length > 0
              ? "⚠ Requieren NC al facturar el 100%"
              : "Sin anticipos pendientes de NC"}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Acreditados</p>
          <p className="text-2xl font-semibold tabular-nums">
            {credited.length}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Ciclo completo</p>
        </div>
      </div>

      {/* Tabla de anticipos */}
      {advances.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground text-sm">
            No hay anticipos registrados.
          </p>
          <p className="text-muted-foreground text-xs mt-1">
            Creá uno con el botón &quot;Nuevo anticipo&quot;.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Neto</TableHead>
                <TableHead className="text-right">IVA</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {advances.map((advance) => (
                <TableRow key={advance.id}>
                  <TableCell className="font-mono text-sm">
                    #{advance.advance_number}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{advance.description}</span>
                    {advance.quote_id && (
                      <span className="text-xs text-muted-foreground block">
                        OC vinculada
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {currencyFormatter.format(advance.net_amount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                    {currencyFormatter.format(advance.tax_amount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm font-semibold">
                    {currencyFormatter.format(advance.total_amount)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {advance.issued_at
                      ? format(new Date(advance.issued_at), "dd MMM yyyy", {
                          locale: es,
                        })
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANTS[advance.status]}>
                      {STATUS_LABELS[advance.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {advance.status === "pending" && (
                      <AdvanceReceiptDialog
                        orgSlug={orgSlug}
                        advanceId={advance.id}
                        advanceNumber={advance.advance_number}
                        advanceTotal={advance.total_amount}
                      />
                    )}
                    {advance.status === "collected" && (
                      <span className="text-xs text-amber-600 font-medium">
                        Pendiente NC
                      </span>
                    )}
                    {advance.status === "credited" && (
                      <span className="text-xs text-muted-foreground">
                        Cerrado
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Aviso flujo NC */}
      {collected.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">
            ⚠ {collected.length} anticipo{collected.length > 1 ? "s" : ""} cobrado
            {collected.length > 1 ? "s" : ""} requiere
            {collected.length > 1 ? "n" : ""} Nota de Crédito
          </p>
          <p className="text-xs text-amber-700 mt-1">
            Al emitir la factura final por el 100% del pedido, el sistema
            requiere generar una Nota de Crédito por el importe del anticipo
            cobrado para acreditar el adelanto.
          </p>
        </div>
      )}
    </div>
  );
}
