"use client";

import { ReceiptIcon, TrashIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AsientoModal } from "@/components/accounting/asiento-modal";
import { RegisterPaymentDialog } from "@/components/collections/register-payment-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import type { AnyEvento } from "@/modules/accounting/types";
import {
  emitDebitNoteAction,
  verifyDebitNoteEmissionAction,
} from "@/modules/arca/actions/emit-debit-note.action";
import { deleteDebitNoteAction } from "@/modules/debit-notes/actions/manage-debit-note.action";
import { useDebitNotePDF } from "@/modules/debit-notes/hooks/use-debit-note-pdf";
import type { DebitNote } from "@/modules/debit-notes/types";
import { sendDebitNoteEmailAction } from "@/modules/email/actions/send-debit-note-email.action";

const STATUS_LABELS = {
  draft: "Borrador",
  pending: "Emitiendo",
  verifying: "Verificando emisión",
  authorized: "Autorizada por ARCA",
  error: "Error de emisión",
} as const;
const REASON_LABELS = {
  INTEREST: "Interés",
  FREIGHT_OR_POST_CHARGE: "Flete o cargo posterior",
  PRICE_DIFFERENCE: "Diferencia de precio",
  OTHER: "Otro",
} as const;
const PAYMENT_CONDITION_LABELS = {
  CASH: "Contado",
  CURRENT_ACCOUNT: "Cuenta corriente",
} as const;

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: fiscal actions and display share the detail card.
export function DebitNoteDetailView({
  orgSlug,
  debitNote,
  canManage,
}: {
  orgSlug: string;
  debitNote: DebitNote;
  canManage: boolean;
}) {
  const router = useRouter();
  const { generatePDF, isGenerating } = useDebitNotePDF({
    orgSlug,
    debitNoteId: debitNote.id,
  });
  const [isPending, startTransition] = useTransition();
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [accountingPayload, setAccountingPayload] = useState<AnyEvento | null>(
    null
  );
  const run = (verify = false) =>
    startTransition(async () => {
      const result = verify
        ? await verifyDebitNoteEmissionAction({
            orgSlug,
            debitNoteId: debitNote.id,
          })
        : await emitDebitNoteAction({ orgSlug, debitNoteId: debitNote.id });
      if (!result.success) {
        setMessage(result.error);
        toast.error(result.error);
        return;
      }
      if (result.data.accountingPayload) {
        toast.success(
          "Nota de Débito fiscal autorizada. Revisá el asiento contable."
        );
        setAccountingPayload(result.data.accountingPayload);
        router.refresh();
        return;
      }
      toast.success(
        result.data.status === "authorized"
          ? "Nota de Débito fiscal autorizada."
          : "La emisión permanece en verificación."
      );
      router.refresh();
    });
  const deleteDraft = () =>
    startTransition(async () => {
      const result = await deleteDebitNoteAction({
        orgSlug,
        debitNoteId: debitNote.id,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Borrador de Nota de Débito eliminado.");
      router.push(`/org/${orgSlug}/notas-de-debito`);
      router.refresh();
    });
  const fiscalNumber =
    debitNote.arcaPointOfSale && debitNote.arcaVoucherNumber
      ? `${String(debitNote.arcaPointOfSale).padStart(4, "0")}-${String(debitNote.arcaVoucherNumber).padStart(8, "0")}`
      : "—";
  const sendEmail = async () => {
    setIsSendingEmail(true);
    const result = await sendDebitNoteEmailAction({
      orgSlug,
      debitNoteId: debitNote.id,
    });
    setIsSendingEmail(false);
    if (result.sent) {
      toast.success("Email enviado correctamente.");
    } else {
      toast.error(result.error);
    }
  };
  return (
    <div className="space-y-6">
      {accountingPayload ? (
        <AsientoModal
          eventoPayload={accountingPayload}
          mode="gate"
          onCancel={() => {
            setAccountingPayload(null);
            router.refresh();
          }}
          onConfirm={() => {
            setAccountingPayload(null);
            toast.success("Asiento contable registrado correctamente.");
            router.refresh();
          }}
          open={Boolean(accountingPayload)}
          persistAs="formal"
        />
      ) : null}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl">
            ND {debitNote.debitNoteNumber}
          </h1>
          <p className="text-muted-foreground text-sm">
            Creada el {formatDateOnly(debitNote.issueDate)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{STATUS_LABELS[debitNote.status]}</Badge>
          {canManage && ["draft", "error"].includes(debitNote.status) ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <TrashIcon className="mr-2 size-4" />
                  Eliminar borrador
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    ¿Eliminar esta Nota de Débito?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Se eliminará el borrador ND {debitNote.debitNoteNumber}.
                    Esta acción no afecta la factura origen.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={isPending}
                    onClick={deleteDraft}
                  >
                    {isPending ? "Eliminando..." : "Eliminar"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos del ajuste</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              <span className="text-muted-foreground">Factura origen: </span>
              <Link
                className="underline"
                href={`/org/${orgSlug}/ventas/${debitNote.salesOrderId}`}
              >
                {debitNote.sale?.invoiceNumber ??
                  `Venta N°${debitNote.sale?.saleNumber ?? "—"}`}
              </Link>
            </p>
            <p>
              <span className="text-muted-foreground">Cliente: </span>
              {debitNote.customer?.fantasyName ??
                debitNote.customer?.businessName ??
                "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Motivo: </span>
              {REASON_LABELS[debitNote.reason]}
              {debitNote.reasonDetail ? ` — ${debitNote.reasonDetail}` : ""}
            </p>
            <p className="font-semibold text-lg">
              {formatCurrency(debitNote.amount)}
            </p>
            <p>
              <span className="text-muted-foreground">Concepto: </span>
              {debitNote.concept ?? debitNote.reasonDetail ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Vencimiento: </span>
              {debitNote.dueDate ? formatDateOnly(debitNote.dueDate) : "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Condición: </span>
              {debitNote.paymentCondition
                ? PAYMENT_CONDITION_LABELS[debitNote.paymentCondition]
                : "—"}
            </p>
            {debitNote.externalReference ? (
              <p>
                <span className="text-muted-foreground">Referencia: </span>
                {debitNote.externalReference}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Comprobante fiscal ARCA</CardTitle>
            <div className="flex gap-2">
              {canManage && debitNote.status === "authorized" ? (
                <Button
                  disabled={isGenerating}
                  onClick={generatePDF}
                  size="sm"
                  variant="outline"
                >
                  {isGenerating ? "Generando..." : "Descargar PDF"}
                </Button>
              ) : null}
              {canManage &&
              debitNote.status === "authorized" &&
              debitNote.accountReceivableId &&
              debitNote.accountReceivable ? (
                <RegisterPaymentDialog
                  accountId={debitNote.accountReceivableId}
                  counterpartyId={debitNote.customerId}
                  counterpartyName={
                    debitNote.customer?.fantasyName ??
                    debitNote.customer?.businessName ??
                    "Cliente"
                  }
                  dueDate={debitNote.accountReceivable.dueDate}
                  orgSlug={orgSlug}
                  pendingBalance={debitNote.accountReceivable.pendingBalance}
                  totalAmount={debitNote.accountReceivable.totalAmount}
                  trigger={
                    <Button size="sm" variant="outline">
                      Registrar cobro
                    </Button>
                  }
                  type="receivable"
                />
              ) : null}
              {canManage && debitNote.status === "authorized" ? (
                <Button
                  disabled={isSendingEmail}
                  onClick={sendEmail}
                  size="sm"
                  variant="outline"
                >
                  {isSendingEmail ? "Enviando..." : "Enviar email"}
                </Button>
              ) : null}
              {canManage &&
              ["pending", "verifying"].includes(debitNote.status) ? (
                <Button
                  disabled={isPending}
                  onClick={() => run(true)}
                  size="sm"
                  variant="outline"
                >
                  Verificar emisión
                </Button>
              ) : null}
              {canManage && ["draft", "error"].includes(debitNote.status) ? (
                <Button disabled={isPending} onClick={() => run()} size="sm">
                  <ReceiptIcon className="mr-2 size-4" weight="bold" />
                  {isPending ? "Emitiendo..." : "Emitir ND fiscal"}
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              <span className="text-muted-foreground">Número fiscal: </span>
              <span className="font-mono">{fiscalNumber}</span>
            </p>
            <p>
              <span className="text-muted-foreground">CAE: </span>
              <span className="font-mono">{debitNote.arcaCae ?? "—"}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Vencimiento CAE: </span>
              {debitNote.arcaCaeExpiresAt
                ? formatDateOnly(debitNote.arcaCaeExpiresAt)
                : "—"}
            </p>
            {(message ?? debitNote.arcaLastError) ? (
              <p className="text-destructive">
                {message ?? debitNote.arcaLastError}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
      {debitNote.items.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Desglose fiscal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {debitNote.items.map((item) => (
              <div
                className="flex justify-between gap-4 border-b pb-2"
                key={item.id}
              >
                <span>
                  {item.description} · {item.quantity} ×{" "}
                  {formatCurrency(item.unitPrice)}
                </span>
                <span>{formatCurrency(item.totalAmount)}</span>
              </div>
            ))}
            <div className="flex justify-between">
              <span>Neto</span>
              <span>
                {formatCurrency(
                  debitNote.items.reduce(
                    (total, item) => total + item.netAmount,
                    0
                  )
                )}
              </span>
            </div>
            {debitNote.taxes.map((tax) => (
              <div className="flex justify-between" key={tax.id}>
                <span>
                  {tax.name} ({tax.rate}%)
                </span>
                <span>{formatCurrency(tax.taxAmount)}</span>
              </div>
            ))}
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{formatCurrency(debitNote.amount)}</span>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
