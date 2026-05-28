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
import { formatCurrency, formatDate } from "@/lib/format";
import { requireAuth } from "@/lib/supabase/auth";
import { getSaleAdvancesAction } from "@/modules/sale-advances/actions/sale-advances.actions";
import type { AdvanceStatus } from "@/modules/sale-advances/types";

type AnticiposPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

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

  await requireAuth();

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
          <p className="text-muted-foreground text-sm">Pendientes de cobro</p>
          <p className="font-semibold text-2xl tabular-nums">
            {pending.length}
          </p>
          <p className="mt-1 text-muted-foreground text-xs tabular-nums">
            {formatCurrency(pending.reduce((s, a) => s + a.total_amount, 0))}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-muted-foreground text-sm">Cobrados (sin NC)</p>
          <p className="font-semibold text-2xl tabular-nums">
            {collected.length}
          </p>
          <p className="mt-1 font-medium text-amber-600 text-xs">
            {collected.length > 0
              ? "⚠ Requieren NC al facturar el 100%"
              : "Sin anticipos pendientes de NC"}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-muted-foreground text-sm">Acreditados</p>
          <p className="font-semibold text-2xl tabular-nums">
            {credited.length}
          </p>
          <p className="mt-1 text-muted-foreground text-xs">Ciclo completo</p>
        </div>
      </div>

      {/* Tabla de anticipos */}
      {advances.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground text-sm">
            No hay anticipos registrados.
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
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
                      <span className="block text-muted-foreground text-xs">
                        OC vinculada
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatCurrency(advance.net_amount)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm tabular-nums">
                    {formatCurrency(advance.tax_amount)}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-sm tabular-nums">
                    {formatCurrency(advance.total_amount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {advance.issued_at ? formatDate(advance.issued_at) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANTS[advance.status]}>
                      {STATUS_LABELS[advance.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {advance.status === "pending" && (
                      <AdvanceReceiptDialog
                        advanceId={advance.id}
                        advanceNumber={advance.advance_number}
                        advanceTotal={advance.total_amount}
                        orgSlug={orgSlug}
                      />
                    )}
                    {advance.status === "collected" && (
                      <span className="font-medium text-amber-600 text-xs">
                        Pendiente NC
                      </span>
                    )}
                    {advance.status === "credited" && (
                      <span className="text-muted-foreground text-xs">
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
          <p className="font-semibold text-amber-800 text-sm">
            ⚠ {collected.length} anticipo{collected.length > 1 ? "s" : ""}{" "}
            cobrado
            {collected.length > 1 ? "s" : ""} requiere
            {collected.length > 1 ? "n" : ""} Nota de Crédito
          </p>
          <p className="mt-1 text-amber-700 text-xs">
            Al emitir la factura final por el 100% del pedido, el sistema
            requiere generar una Nota de Crédito por el importe del anticipo
            cobrado para acreditar el adelanto.
          </p>
        </div>
      )}
    </div>
  );
}
