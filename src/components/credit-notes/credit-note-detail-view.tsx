"use client";

import { FilePdfIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { emitCreditNoteArcaInvoiceAction } from "@/modules/arca/actions/emit-credit-note-invoice.action";
import { useCreditNotePDF } from "@/modules/credit-notes/hooks/use-credit-note-pdf";
import type { CreditNote } from "@/modules/credit-notes/types";
import { EXTENDED_INVOICE_TYPE_LABELS } from "@/modules/sales/invoice-type-utils";

type CreditNoteDetailViewProps = {
  creditNote: CreditNote;
  orgSlug: string;
};

type ArcaStatus = "not_requested" | "pending" | "authorized" | "error";

function ArcaStatusBadge({ status }: { status: ArcaStatus }) {
  if (status === "authorized") {
    return (
      <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
        ✓ Autorizado en ARCA
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge className="border-rose-500/20" variant="destructive">
        Error ARCA
      </Badge>
    );
  }
  if (status === "pending") {
    return <Badge variant="secondary">Pendiente</Badge>;
  }
  return null;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: manages ARCA state, PDF generation, and multiple conditional UI sections
export function CreditNoteDetailView({
  creditNote,
  orgSlug,
}: CreditNoteDetailViewProps) {
  const { generatePDF, isGenerating } = useCreditNotePDF({
    orgSlug,
    creditNoteId: creditNote.id,
  });

  const [isEmitting, setIsEmitting] = useState(false);

  // Check ARCA fields (they come from DB after migration)
  // biome-ignore lint/suspicious/noExplicitAny: ARCA fields added by migration, not in base type yet
  const raw = creditNote as any;
  const arcaStatus: ArcaStatus = raw.arca_status ?? "not_requested";
  const arcaCae: string | null = raw.arca_cae ?? null;
  const arcaError: string | null = raw.arca_last_error ?? null;

  // Una NC puede tener tipo correcto (NOTA_DE_CREDITO_A/B/C)
  // o el tipo incorrecto heredado de la venta (FACTURA_A/B/C) en NCs
  // creadas antes del fix. En ambos casos habilitamos la emisión ARCA
  // si la NC está vinculada a una venta o si el tipo ya es NC correcto.
  const isCreditNoteType =
    creditNote.invoiceType === "NOTA_DE_CREDITO_A" ||
    creditNote.invoiceType === "NOTA_DE_CREDITO_B" ||
    creditNote.invoiceType === "NOTA_DE_CREDITO_C";

  const isLinkedToSale = Boolean(creditNote.sale);

  const canEmitArcaInvoice =
    (isCreditNoteType || isLinkedToSale) &&
    arcaStatus !== "authorized" &&
    creditNote.status !== "CANCELLED";

  async function handleEmitArca() {
    setIsEmitting(true);
    try {
      const result = await emitCreditNoteArcaInvoiceAction(
        orgSlug,
        creditNote.id
      );
      if (result.success) {
        toast.success(
          `Nota de Crédito autorizada en ARCA. CAE: ${result.data.cae ?? "—"}`
        );
        // Refresh is handled by router.refresh() or the parent page
        window.location.reload();
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
    creditNote.customer?.fantasyName ??
    creditNote.customer?.businessName ??
    "—";

  let saleRef = "—";
  if (creditNote.sale?.invoiceNumber) {
    saleRef = creditNote.sale.invoiceNumber;
  } else if (creditNote.sale?.saleNumber != null) {
    saleRef = `N°${creditNote.sale.saleNumber}`;
  }

  const invoiceTypeLabel =
    EXTENDED_INVOICE_TYPE_LABELS[
      creditNote.invoiceType as keyof typeof EXTENDED_INVOICE_TYPE_LABELS
    ] ?? creditNote.invoiceType;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-2xl">
              NC {creditNote.creditNoteNumber ?? "—"}
            </h1>
            {arcaStatus !== "not_requested" && (
              <ArcaStatusBadge status={arcaStatus} />
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            Emitida el {formatDateOnly(creditNote.issueDate)}
          </p>
        </div>
        <div className="flex gap-2">
          {canEmitArcaInvoice && (
            <Button
              className="bg-blue-600 text-white hover:bg-blue-700"
              disabled={isEmitting}
              onClick={handleEmitArca}
              variant="default"
            >
              {isEmitting ? "Emitiendo en ARCA..." : "Emitir en ARCA"}
            </Button>
          )}
          <Button
            disabled={isGenerating}
            onClick={generatePDF}
            variant="outline"
          >
            <FilePdfIcon className="mr-2 size-4" weight="duotone" />
            {isGenerating ? "Generando..." : "Descargar PDF"}
          </Button>
        </div>
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
                  {creditNote.creditNoteNumber ?? "—"}
                </dd>
              </div>
              <Separator />
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tipo</dt>
                <dd>{invoiceTypeLabel}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Fecha</dt>
                <dd>{formatDateOnly(creditNote.issueDate)}</dd>
              </div>
              <Separator />
              <div className="flex justify-between font-medium">
                <dt>Monto</dt>
                <dd className="text-lg">{formatCurrency(creditNote.amount)}</dd>
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
              {creditNote.customer?.businessName &&
                creditNote.customer.fantasyName &&
                creditNote.customer.fantasyName !==
                  creditNote.customer.businessName && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Razón social</dt>
                    <dd>{creditNote.customer.businessName}</dd>
                  </div>
                )}
              <Separator />
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Venta ref.</dt>
                <dd>{saleRef}</dd>
              </div>
              {creditNote.sale?.totalAmount != null && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Total venta</dt>
                  <dd>{formatCurrency(creditNote.sale.totalAmount)}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* ARCA Section */}
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
              {arcaCae && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">CAE</dt>
                  <dd className="font-medium font-mono">{arcaCae}</dd>
                </div>
              )}
              {arcaError && arcaStatus === "error" && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-xs">
                  {arcaError}
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      {creditNote.observations && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Observaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{creditNote.observations}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
