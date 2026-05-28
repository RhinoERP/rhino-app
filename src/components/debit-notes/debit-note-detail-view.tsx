"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  type ArcaStatus,
  ArcaStatusBadge,
} from "@/components/arca/arca-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { emitDebitNoteArcaInvoiceAction } from "@/modules/arca/actions/emit-debit-note-invoice.action";
import {
  debitNoteDetailQueryKey,
  debitNotesQueryKey,
} from "@/modules/debit-notes/queries/query-keys";
import type { DebitNote } from "@/modules/debit-notes/types";
import { EXTENDED_INVOICE_TYPE_LABELS } from "@/modules/sales/invoice-type-utils";

type DebitNoteDetailViewProps = {
  debitNote: DebitNote;
  orgSlug: string;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: manages ARCA state and multiple conditional UI sections
export function DebitNoteDetailView({
  debitNote,
  orgSlug,
}: DebitNoteDetailViewProps) {
  const [isEmitting, setIsEmitting] = useState(false);
  const queryClient = useQueryClient();

  const arcaStatus: ArcaStatus = debitNote.arcaStatus;
  const canEmitArcaInvoice =
    (debitNote.invoiceType === "NOTA_DE_DEBITO_A" ||
      debitNote.invoiceType === "NOTA_DE_DEBITO_B" ||
      debitNote.invoiceType === "NOTA_DE_DEBITO_C") &&
    arcaStatus !== "authorized" &&
    debitNote.status !== "CANCELLED";

  async function handleEmitArca() {
    setIsEmitting(true);
    try {
      const result = await emitDebitNoteArcaInvoiceAction(
        orgSlug,
        debitNote.id
      );
      if (result.success) {
        toast.success(
          `Nota de Débito autorizada en ARCA. CAE: ${result.data.cae ?? "—"}`
        );
        queryClient.invalidateQueries({
          queryKey: debitNotesQueryKey(orgSlug),
        });
        queryClient.invalidateQueries({
          queryKey: debitNoteDetailQueryKey(orgSlug, debitNote.id),
        });
      } else {
        toast.error(`Error ARCA: ${result.error}`);
      }
    } catch {
      toast.error("Error inesperado al emitir en ARCA.");
    } finally {
      setIsEmitting(false);
    }
  }

  const customerName =
    debitNote.customer?.fantasyName ?? debitNote.customer?.businessName ?? "—";

  let saleRef = "—";
  if (debitNote.sale?.invoiceNumber) {
    saleRef = debitNote.sale.invoiceNumber;
  } else if (debitNote.sale?.saleNumber != null) {
    saleRef = `N°${debitNote.sale.saleNumber}`;
  }

  const invoiceTypeLabel =
    EXTENDED_INVOICE_TYPE_LABELS[debitNote.invoiceType] ??
    debitNote.invoiceType;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-2xl">
              ND {debitNote.debitNoteNumber ?? "—"}
            </h1>
            {arcaStatus !== "not_requested" && (
              <ArcaStatusBadge status={arcaStatus} />
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            Emitida el {formatDateOnly(debitNote.issueDate)}
          </p>
        </div>
        {canEmitArcaInvoice && (
          <Button
            className="bg-blue-600 text-white hover:bg-blue-700"
            disabled={isEmitting}
            onClick={handleEmitArca}
          >
            {isEmitting ? "Emitiendo en ARCA..." : "Emitir en ARCA"}
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Datos del documento</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Número</dt>
                <dd className="font-medium font-mono">
                  {debitNote.debitNoteNumber ?? "—"}
                </dd>
              </div>
              <Separator />
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tipo</dt>
                <dd>{invoiceTypeLabel}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Fecha</dt>
                <dd>{formatDateOnly(debitNote.issueDate)}</dd>
              </div>
              <Separator />
              <div className="flex justify-between font-medium">
                <dt>Monto</dt>
                <dd className="text-lg">{formatCurrency(debitNote.amount)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Referencias</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Cliente</dt>
                <dd className="font-medium">{customerName}</dd>
              </div>
              <Separator />
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Venta ref.</dt>
                <dd>{saleRef}</dd>
              </div>
              {debitNote.sale?.totalAmount != null && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Total venta</dt>
                  <dd>{formatCurrency(debitNote.sale.totalAmount)}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      </div>

      {arcaStatus !== "not_requested" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">ARCA / Fiscalización</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Estado</dt>
                <dd>
                  <ArcaStatusBadge status={arcaStatus} />
                </dd>
              </div>
              {debitNote.arcaCae && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">CAE</dt>
                  <dd className="font-medium font-mono">{debitNote.arcaCae}</dd>
                </div>
              )}
              {debitNote.arcaLastError && arcaStatus === "error" && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-xs">
                  {debitNote.arcaLastError}
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      {debitNote.observations && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Observaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{debitNote.observations}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
