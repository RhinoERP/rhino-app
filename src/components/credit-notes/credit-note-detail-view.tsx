"use client";

import { FilePdfIcon, ReceiptIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";
import { emitCreditNoteAction } from "@/modules/arca/actions/emit-credit-note.action";
import { useCreditNotePDF } from "@/modules/credit-notes/hooks/use-credit-note-pdf";
import type { CreditNote } from "@/modules/credit-notes/types";
import { INVOICE_TYPE_LABELS } from "@/modules/sales/invoice-type-utils";
import { CreditNoteEmailButton } from "./credit-note-email-button";

type CreditNoteDetailViewProps = {
  creditNote: CreditNote;
  orgSlug: string;
};

const CREDIT_NOTE_INVOICE_TYPE_LABELS: Record<string, string> = {
  ...INVOICE_TYPE_LABELS,
  NOTA_DE_VENTA: "Nota de Venta",
};

const ARCA_STATUS_LABELS = {
  not_requested: "No emitida",
  pending: "Emitiendo",
  authorized: "NC fiscal emitida",
  error: "Error fiscal",
} as const;

const ARCA_STATUS_BADGE_CLASS_NAMES = {
  not_requested: "border-slate-200 bg-slate-50 text-slate-700",
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  authorized: "border-emerald-200 bg-emerald-50 text-emerald-700",
  error: "border-red-200 bg-red-50 text-red-700",
} as const;

const EMAIL_STATUS_LABELS: Record<string, string> = {
  not_sent: "No enviado",
  pending: "Enviando",
  sent: "Enviado",
  delivered: "Entregado",
  delivery_delayed: "Demorado",
  bounced: "Rebotado",
  complained: "Reclamado",
  failed: "Error",
};

const ORIGIN_LABELS: Record<string, string> = {
  RETURN: "Devolución",
  PURCHASE_TARGET: "Objetivo de compra",
  MANUAL_ADJUSTMENT: "Ajuste manual",
  OTHER: "Otro",
};

function formatArcaNumber(
  pointOfSale: number | null,
  voucherNumber: number | null
): string | null {
  if (!(pointOfSale && voucherNumber)) {
    return null;
  }

  return `${String(pointOfSale).padStart(4, "0")}-${String(voucherNumber).padStart(8, "0")}`;
}

function getFiscalEmissionDisabledReason(
  creditNote: CreditNote
): string | null {
  if (creditNote.arcaStatus === "authorized") {
    return "La nota de crédito fiscal ya fue emitida.";
  }

  if (creditNote.arcaStatus === "pending") {
    return "Ya hay una emisión fiscal en curso.";
  }

  if (creditNote.status !== "CONFIRMED") {
    return "Sólo se pueden emitir notas de crédito confirmadas.";
  }

  if (creditNote.isHistorical || !creditNote.salesOrderId || !creditNote.sale) {
    return "En esta fase sólo se emiten NC fiscales asociadas a ventas.";
  }

  if (
    creditNote.sale.arcaStatus !== "authorized" ||
    !creditNote.sale.arcaPointOfSale ||
    !creditNote.sale.arcaVoucherNumber ||
    !creditNote.sale.arcaVoucherTypeCode
  ) {
    return "La venta original debe estar autorizada en ARCA antes de emitir la NC fiscal.";
  }

  return null;
}

function getFinancialTreatmentLabel(creditNote: CreditNote): string {
  if (!creditNote.applyToReceivable) {
    return "Saldo a favor";
  }

  if (creditNote.appliedToReceivableAmount > 0) {
    return `Aplicada a factura (${formatCurrency(creditNote.appliedToReceivableAmount)})`;
  }

  return "Aplicación a factura solicitada";
}

function CreditNoteFinancialTreatment({
  creditNote,
}: {
  creditNote: CreditNote;
}) {
  if (!(creditNote.salesOrderId && !creditNote.salesReturnId)) {
    return null;
  }

  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">Tratamiento financiero</dt>
      <dd className="text-right">{getFinancialTreatmentLabel(creditNote)}</dd>
    </div>
  );
}

function CreditNoteArcaSection({
  creditNote,
  orgSlug,
}: CreditNoteDetailViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [arcaError, setArcaError] = useState<string | null>(null);
  const fiscalNumber = formatArcaNumber(
    creditNote.arcaPointOfSale,
    creditNote.arcaVoucherNumber
  );
  const isAuthorized = creditNote.arcaStatus === "authorized";
  const disabledReason = getFiscalEmissionDisabledReason(creditNote);
  const isEmitDisabled = isPending || Boolean(disabledReason);

  const handleEmitFiscalCreditNote = () => {
    if (disabledReason) {
      setArcaError(disabledReason);
      toast.error(disabledReason);
      return;
    }

    setArcaError(null);

    startTransition(async () => {
      try {
        const result = await emitCreditNoteAction({
          orgSlug,
          creditNoteId: creditNote.id,
        });

        if (!result.success) {
          setArcaError(result.error);
          toast.error(result.error);
          router.refresh();
          return;
        }

        toast.success(
          result.data.idempotent
            ? "La nota de crédito fiscal ya estaba emitida."
            : "Nota de crédito fiscal emitida correctamente."
        );
        router.refresh();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "No se pudo emitir la nota de crédito fiscal.";
        setArcaError(message);
        toast.error(message);
      }
    });
  };

  return (
    <Card>
      <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base">Comprobante fiscal ARCA</CardTitle>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            className={cn(
              "border",
              ARCA_STATUS_BADGE_CLASS_NAMES[creditNote.arcaStatus]
            )}
            variant="outline"
          >
            {ARCA_STATUS_LABELS[creditNote.arcaStatus]}
          </Badge>
          <Button
            disabled={isEmitDisabled}
            onClick={handleEmitFiscalCreditNote}
            size="sm"
            type="button"
          >
            <ReceiptIcon className="mr-2 size-4" weight="bold" />
            {isPending ? "Emitiendo..." : "Emitir NC fiscal"}
          </Button>
          <CreditNoteEmailButton
            creditNoteId={creditNote.id}
            customerEmail={creditNote.customer?.email}
            invoiceEmailRecipient={creditNote.invoiceEmailRecipient}
            invoiceEmailStatus={creditNote.invoiceEmailStatus}
            isAuthorized={isAuthorized}
            orgSlug={orgSlug}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="space-y-1">
            <p className="text-muted-foreground text-sm">Número fiscal</p>
            <p className="font-medium font-mono">{fiscalNumber ?? "—"}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-sm">Punto de venta</p>
            <p className="font-medium">{creditNote.arcaPointOfSale ?? "—"}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-sm">CAE</p>
            <p className="font-medium font-mono">{creditNote.arcaCae ?? "—"}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-sm">Vencimiento CAE</p>
            <p className="font-medium">
              {creditNote.arcaCaeExpiresAt
                ? formatDateOnly(creditNote.arcaCaeExpiresAt)
                : "—"}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-sm">Autorización</p>
            <p className="font-medium">
              {creditNote.arcaAuthorizedAt
                ? formatDateOnly(creditNote.arcaAuthorizedAt)
                : "—"}
            </p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <p className="text-muted-foreground text-sm">Email</p>
            <p className="font-medium">
              {EMAIL_STATUS_LABELS[creditNote.invoiceEmailStatus] ??
                creditNote.invoiceEmailStatus}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-sm">Destinatario</p>
            <p className="font-medium">
              {creditNote.invoiceEmailRecipient ??
                creditNote.customer?.email ??
                "—"}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-sm">Último envío</p>
            <p className="font-medium">
              {creditNote.invoiceEmailSentAt
                ? formatDateOnly(creditNote.invoiceEmailSentAt)
                : "—"}
            </p>
          </div>
        </div>
        {(arcaError || creditNote.arcaLastError || disabledReason) && (
          <p className="text-red-600 text-sm">
            {arcaError ?? creditNote.arcaLastError ?? disabledReason}
          </p>
        )}
        {creditNote.invoiceEmailLastError ? (
          <p className="text-red-600 text-sm">
            {creditNote.invoiceEmailLastError}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

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
                  {CREDIT_NOTE_INVOICE_TYPE_LABELS[creditNote.invoiceType] ??
                    creditNote.invoiceType}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Origen</dt>
                <dd>
                  {ORIGIN_LABELS[creditNote.originType] ??
                    creditNote.originType}
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
                <dd>
                  {creditNote.salesOrderId ? (
                    <Link
                      className="font-medium hover:underline"
                      href={`/org/${orgSlug}/ventas/${creditNote.salesOrderId}`}
                    >
                      {saleRef}
                    </Link>
                  ) : (
                    saleRef
                  )}
                </dd>
              </div>
              {creditNote.salesReturnId && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Devolución</dt>
                  <dd className="truncate font-mono text-xs">
                    {creditNote.salesReturnId}
                  </dd>
                </div>
              )}
              {creditNote.sourceDocuments.length > 1 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Facturas asociadas</dt>
                  <dd>{creditNote.sourceDocuments.length}</dd>
                </div>
              )}
              {creditNote.sale?.totalAmount != null && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Total venta</dt>
                  <dd>{formatCurrency(creditNote.sale.totalAmount)}</dd>
                </div>
              )}
              <CreditNoteFinancialTreatment creditNote={creditNote} />
            </dl>
          </CardContent>
        </Card>
      </div>

      <CreditNoteArcaSection creditNote={creditNote} orgSlug={orgSlug} />

      {creditNote.items.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Líneas de la nota</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 font-medium">Concepto</th>
                    <th className="py-2 text-right font-medium">Cant.</th>
                    <th className="py-2 text-right font-medium">Neto</th>
                    <th className="py-2 text-right font-medium">Imp.</th>
                    <th className="py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {creditNote.items.map((item) => (
                    <tr className="border-b last:border-0" key={item.id}>
                      <td className="py-2">{item.description}</td>
                      <td className="py-2 text-right">{item.quantity}</td>
                      <td className="py-2 text-right">
                        {formatCurrency(item.netAmount)}
                      </td>
                      <td className="py-2 text-right">
                        {formatCurrency(item.taxAmount)}
                      </td>
                      <td className="py-2 text-right font-medium">
                        {formatCurrency(item.totalAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
