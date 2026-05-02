"use client";

import { FilePdfIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { useCreditNotePDF } from "@/modules/credit-notes/hooks/use-credit-note-pdf";
import type { CreditNote } from "@/modules/credit-notes/types";

type CreditNoteDetailViewProps = {
  creditNote: CreditNote;
  orgSlug: string;
};

const INVOICE_TYPE_LABELS: Record<string, string> = {
  FACTURA_A: "Factura A",
  FACTURA_B: "Factura B",
  FACTURA_C: "Factura C",
  FACTURA_E: "Factura E",
  NOTA_DE_VENTA: "Nota de Venta",
};

export function CreditNoteDetailView({
  creditNote,
  orgSlug,
}: CreditNoteDetailViewProps) {
  const { generatePDF, isGenerating } = useCreditNotePDF({
    orgSlug,
    creditNoteId: creditNote.id,
  });

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-heading text-2xl">
            NC {creditNote.creditNoteNumber ?? "—"}
          </h1>
          <p className="text-muted-foreground text-sm">
            Emitida el {formatDateOnly(creditNote.issueDate)}
          </p>
        </div>
        <Button disabled={isGenerating} onClick={generatePDF} variant="outline">
          <FilePdfIcon className="mr-2 size-4" weight="duotone" />
          {isGenerating ? "Generando..." : "Descargar PDF"}
        </Button>
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
                <dd>
                  {INVOICE_TYPE_LABELS[creditNote.invoiceType] ??
                    creditNote.invoiceType}
                </dd>
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
