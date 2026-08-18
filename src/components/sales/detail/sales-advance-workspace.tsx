"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { issueSalesAdvanceAction } from "@/modules/sales-advances/actions/issue-sales-advance.action";
import { settleSalesAdvanceAction } from "@/modules/sales-advances/actions/settle-sales-advance.action";
import { useSalesAdvanceById } from "@/modules/sales-advances/hooks/use-sales-advance";
import {
  formatSalesAdvancePercentage,
  type SalesAdvance,
  salesAdvanceStatusLabels,
} from "@/modules/sales-advances/types";

type SalesAdvanceWorkspaceProps = {
  orgSlug: string;
  sale: {
    id: string;
    saleNumber: number | null;
    invoiceNumber: string | null;
    totalAmount: number;
    customerName: string | null;
  };
  advanceId: string;
  initialAdvance: SalesAdvance;
  canManage: boolean;
};

function getSaleLabel(sale: SalesAdvanceWorkspaceProps["sale"]) {
  if (sale.invoiceNumber) {
    return `Factura ${sale.invoiceNumber}`;
  }
  if (sale.saleNumber !== null) {
    return `Venta #${sale.saleNumber}`;
  }
  return "Venta final";
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: persisted workflow states each expose a distinct recovery action.
export function SalesAdvanceWorkspace({
  orgSlug,
  sale,
  advanceId,
  initialAdvance,
  canManage,
}: SalesAdvanceWorkspaceProps) {
  const { data, refetch } = useSalesAdvanceById(orgSlug, advanceId);
  const advance = data ?? initialAdvance;
  const [pending, setPending] = useState(false);
  const finalBalance = Math.max(0, sale.totalAmount - advance.amount);
  const canRetryIssuance =
    advance.status === "DRAFT" ||
    (advance.status === "FAILED_RECOVERABLE" && !advance.advanceInvoiceNumber);
  const canContinueSettlement =
    advance.originType !== "PREVENTA" &&
    (advance.status === "PAID" ||
      advance.status === "FINAL_INVOICED" ||
      advance.status === "CREDIT_NOTE_SUBMITTED" ||
      advance.status === "CREDIT_AVAILABLE" ||
      (advance.status === "FAILED_RECOVERABLE" &&
        Boolean(advance.finalReceivableId || advance.creditNoteId)));

  const run = async (operation: () => Promise<unknown>) => {
    setPending(true);
    try {
      await operation();
      await refetch();
      toast.success("Anticipo actualizado");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar el anticipo"
      );
    } finally {
      setPending(false);
    }
  };

  const saleLabel = getSaleLabel(sale);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-muted-foreground text-sm">
            Gestión fiscal y de cobranzas
          </p>
          <h1 className="font-heading text-2xl">Anticipo</h1>
          <p className="text-muted-foreground text-sm">
            {saleLabel}
            {sale.customerName ? ` · ${sale.customerName}` : ""}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/org/${orgSlug}/ventas/${sale.id}`}>
            Volver a la venta
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Estado del anticipo</CardTitle>
            <CardDescription>
              El comprobante de anticipo no afecta el stock y se liquida contra
              la factura final.
            </CardDescription>
          </div>
          <Badge variant="outline">
            {salesAdvanceStatusLabels[advance.status]}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <p className="text-muted-foreground text-sm">Total de venta</p>
              <p className="font-medium">{formatCurrency(sale.totalAmount)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">
                Importe anticipado
              </p>
              <p className="font-medium">{formatCurrency(advance.amount)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Porcentaje</p>
              <p className="font-medium">
                {formatSalesAdvancePercentage(advance.percentageSnapshot)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">
                Saldo final estimado
              </p>
              <p className="font-medium">{formatCurrency(finalBalance)}</p>
            </div>
          </div>

          {advance.fiscalSnapshot ? (
            <p className="text-muted-foreground text-sm">
              {advance.fiscalSnapshot.description}: neto{" "}
              {formatCurrency(advance.fiscalSnapshot.netAmount)} · impuestos{" "}
              {formatCurrency(
                advance.amount - advance.fiscalSnapshot.netAmount
              )}
            </p>
          ) : null}

          {(advance.advanceInvoiceNumber || advance.creditNoteNumber) && (
            <div className="space-y-2 rounded-md border p-4 text-sm">
              <p className="font-medium">Comprobantes ARCA</p>
              {advance.advanceInvoiceNumber ? (
                <p className="text-muted-foreground">
                  Factura de anticipo: {advance.advanceInvoiceNumber}
                  {advance.advanceArcaCae
                    ? ` · CAE ${advance.advanceArcaCae}`
                    : ""}
                </p>
              ) : null}
              {advance.creditNoteNumber ? (
                <p className="text-muted-foreground">
                  Nota de crédito: {advance.creditNoteNumber}
                  {advance.creditNoteArcaCae
                    ? ` · CAE ${advance.creditNoteArcaCae}`
                    : ""}
                </p>
              ) : null}
            </div>
          )}

          {advance.lastError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">
              {advance.lastError}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {canRetryIssuance && canManage ? (
              <Button
                disabled={pending}
                onClick={() =>
                  run(() =>
                    issueSalesAdvanceAction({ orgSlug, advanceId: advance.id })
                  )
                }
              >
                Emitir factura de anticipo
              </Button>
            ) : null}
            {advance.status === "INVOICED" ? (
              <Button asChild variant="outline">
                <Link
                  href={
                    advance.advanceReceivableId
                      ? `/org/${orgSlug}/cobranzas?cobrar=${advance.advanceReceivableId}`
                      : `/org/${orgSlug}/cobranzas`
                  }
                >
                  Registrar cobro
                </Link>
              </Button>
            ) : null}
            {canContinueSettlement && canManage ? (
              <Button
                disabled={pending}
                onClick={() =>
                  run(() =>
                    settleSalesAdvanceAction({ orgSlug, advanceId: advance.id })
                  )
                }
              >
                {advance.status === "PAID"
                  ? "Liquidar anticipo"
                  : "Continuar liquidación"}
              </Button>
            ) : null}
            {advance.status === "CREDIT_APPLIED" ? (
              <Button asChild variant="outline">
                <Link href={`/org/${orgSlug}/cobranzas`}>
                  Cobrar saldo restante
                </Link>
              </Button>
            ) : null}
            {advance.creditNoteId ? (
              <Button asChild variant="outline">
                <Link
                  href={`/org/${orgSlug}/notas-de-credito/${advance.creditNoteId}`}
                >
                  Ver nota de crédito
                </Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
