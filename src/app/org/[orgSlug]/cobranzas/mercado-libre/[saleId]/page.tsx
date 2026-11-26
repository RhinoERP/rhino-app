import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CollectionsSectionNav } from "@/components/collections/collections-section-nav";
import { MeliAccountingAccessError } from "@/components/mercadolibre/meli-accounting-access-error";
import { MeliAccountingDraft } from "@/components/mercadolibre/meli-accounting-draft";
import { MeliPaymentAccountingHistory } from "@/components/mercadolibre/meli-payment-accounting-history";
import {
  MeliPaymentForm,
  VoidMeliPaymentForm,
} from "@/components/mercadolibre/meli-payment-form";
import { MeliPaymentPreparation } from "@/components/mercadolibre/meli-payment-preparation";
import { formatCurrency, formatDate, formatDateOnly } from "@/lib/format";
import { getCollectionsPageAccess } from "@/modules/collections/service/collections-access.service";
import {
  canManageMeliAccounting,
  canManageMeliPayments,
  hasMeliAccess,
} from "@/modules/mercadolibre/permissions";
import { listMeliAccountingDrafts } from "@/modules/mercadolibre/service/meli-accounting-drafts.service";
import { getMeliAccountingPageAccess } from "@/modules/mercadolibre/service/meli-accounting-page-access";
import { listMeliPaymentPreparations } from "@/modules/mercadolibre/service/meli-payment-preparations.service";
import { getMeliPaymentHistory } from "@/modules/mercadolibre/service/meli-payments.service";
import { getMeliFiscalStatusLabel } from "@/modules/mercadolibre/utils/fiscal-status";

const labels = {
  UNPAID: "Sin cobro registrado",
  PARTIAL: "Parcialmente cobrada",
  PAID: "Cobro completo",
};

function PaymentAccountingControls({
  payment,
  draft,
  preparation,
  canReview,
  canRecover,
  orgSlug,
  orgId,
  saleId,
}: {
  payment: NonNullable<
    Awaited<ReturnType<typeof getMeliPaymentHistory>>
  >["data"][number];
  draft:
    | PromiseSettledResult<Awaited<ReturnType<typeof listMeliAccountingDrafts>>>
    | undefined;
  preparation:
    | PromiseSettledResult<
        Awaited<ReturnType<typeof listMeliPaymentPreparations>>
      >
    | undefined;
  canReview: boolean;
  canRecover: boolean;
  orgSlug: string;
  orgId: string;
  saleId: string;
}) {
  return (
    <>
      {canReview && (
        <>
          {draft?.status === "fulfilled" ? (
            <MeliAccountingDraft
              currency={payment.currency}
              editable={
                payment.status === "RECORDED" &&
                preparation?.status === "fulfilled" &&
                !preparation.value.some((item) => item.status === "PREPARED")
              }
              history={draft.value}
              key={`${payment.id}-${draft.value[0]?.version ?? 0}`}
              orgId={orgId}
              orgSlug={orgSlug}
              paymentId={payment.id}
              previewAvailable={payment.status === "RECORDED"}
              saleId={saleId}
            />
          ) : (
            <p className="text-destructive text-sm" role="alert">
              No se pudo consultar el desglose contable de este cobro. Actualizá
              la página para reintentar; el desglose no está disponible para
              revisión.
            </p>
          )}
          <MeliPaymentAccountingHistory
            orgSlug={orgSlug}
            paymentId={payment.id}
            preparations={
              preparation?.status === "fulfilled"
                ? preparation.value
                : undefined
            }
          />
        </>
      )}
      {canRecover &&
        (preparation?.status === "fulfilled" ? (
          <MeliPaymentPreparation
            draftId={
              draft?.status === "fulfilled"
                ? draft.value.find((item) => item.active)?.id
                : undefined
            }
            enabled={canReview && payment.status === "RECORDED"}
            orgSlug={orgSlug}
            paymentId={payment.id}
            preparations={preparation.value}
          />
        ) : (
          <p className="text-destructive" role="alert">
            No se pudo consultar la preparación contable de este cobro.
            Actualizá la página antes de modificar el desglose.
          </p>
        ))}
    </>
  );
}

export default async function MeliCollectionSalePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; saleId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { orgSlug, saleId } = await params;
  if (!z.uuid().safeParse(saleId).success) {
    notFound();
  }
  const { layout, sections } = await getCollectionsPageAccess(
    orgSlug,
    "mercadoLibre"
  );
  const search = await searchParams;
  const page = Math.max(
    1,
    Math.min(100_000, Number.parseInt(search.page ?? "1", 10) || 1)
  );
  const history = await getMeliPaymentHistory(orgSlug, saleId, page);
  if (!history) {
    notFound();
  }
  const { sale } = history;
  const canManage = canManageMeliPayments(layout.permissions);
  const accountingAccess = await getMeliAccountingPageAccess(
    orgSlug,
    layout.permissions
  );
  const canReviewAccounting = accountingAccess === "enabled";
  const canRecoverAccounting = canManageMeliAccounting(layout.permissions);
  const drafts = canReviewAccounting
    ? await Promise.allSettled(
        history.data.map((payment) =>
          listMeliAccountingDrafts(orgSlug, payment.id)
        )
      )
    : [];
  const preparations = canRecoverAccounting
    ? await Promise.allSettled(
        history.data.map((payment) =>
          listMeliPaymentPreparations(orgSlug, payment.id)
        )
      )
    : [];
  const buyer = sale.receiver;
  return (
    <div className="space-y-5">
      <CollectionsSectionNav
        active="mercadoLibre"
        orgSlug={orgSlug}
        {...sections}
      />
      <Link
        className="text-sm hover:underline"
        href={`/org/${orgSlug}/cobranzas/mercado-libre`}
      >
        Volver a Cobros Meli
      </Link>
      <h1 className="font-heading text-2xl">
        Cobros de venta Meli #{sale.saleNumber}
      </h1>
      <MeliAccountingAccessError visible={accountingAccess === "error"} />
      <div className="grid gap-4 rounded-md border p-4 text-sm sm:grid-cols-2">
        <div className="space-y-2">
          <p>Orden Meli: {sale.marketplaceOrderNumber}</p>
          <p>Fecha de venta: {formatDateOnly(sale.saleDate)}</p>
          <p>Depósito: {sale.warehouseName}</p>
          <p>Comprador: {sale.buyerName}</p>
          <p>
            {buyer.document_type}: {buyer.document_number}
          </p>
          <p>{buyer.address}</p>
        </div>
        <div className="space-y-2">
          <p>Total venta: {formatCurrency(sale.totalAmount, sale.currency)}</p>
          <p>
            Bruto cobrado registrado:{" "}
            {formatCurrency(sale.collectedAmount, sale.currency)}
          </p>
          <p>
            Sin cobro registrado:{" "}
            {formatCurrency(sale.outstandingAmount, sale.currency)}
          </p>
          <p className="font-semibold">{labels[sale.status]}</p>
          <p>
            Factura:{" "}
            {sale.invoiceNumber ?? getMeliFiscalStatusLabel(sale.arcaStatus)}
          </p>
          {hasMeliAccess(layout.permissions) && (
            <Link
              className="font-medium hover:underline"
              href={`/org/${orgSlug}/venta-directa/mercado-libre/${saleId}`}
            >
              Ver venta y comprobantes
            </Link>
          )}
        </div>
      </div>
      {sale.saleStatus === "CANCELLED" && (
        <p className="text-muted-foreground text-sm">
          Venta cancelada. Se conserva el historial; no se admiten nuevos
          cobros.
        </p>
      )}
      {canManage && sale.canRegister && (
        <MeliPaymentForm orgSlug={orgSlug} sale={sale} />
      )}
      <section className="space-y-3">
        <h2 className="font-semibold text-lg">Historial de cobros brutos</h2>
        {history.data.map((payment, index) => (
          <article
            className="space-y-3 rounded-md border p-4 text-sm"
            id={`payment-${payment.id}`}
            key={payment.id}
          >
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-semibold">
                {formatCurrency(payment.amount, payment.currency)} ·{" "}
                {formatDateOnly(payment.payment_date)}
              </p>
              <span>
                {payment.status === "VOIDED" ? "Carga anulada" : "Registrado"}
              </span>
            </div>
            <p>
              Destino operativo: Mercado Pago · ID de operación:{" "}
              {payment.reference_number}
            </p>
            {payment.notes && <p>Notas: {payment.notes}</p>}
            {payment.status === "VOIDED" && (
              <p className="text-muted-foreground">
                Motivo de anulación: {payment.void_reason}
                {payment.voided_at ? ` · ${formatDate(payment.voided_at)}` : ""}
              </p>
            )}
            <PaymentAccountingControls
              canRecover={canRecoverAccounting}
              canReview={canReviewAccounting}
              draft={drafts[index]}
              orgId={layout.currentOrganization.id}
              orgSlug={orgSlug}
              payment={payment}
              preparation={preparations[index]}
              saleId={saleId}
            />
            {canManage && payment.status === "RECORDED" && (
              <VoidMeliPaymentForm orgSlug={orgSlug} paymentId={payment.id} />
            )}
          </article>
        ))}
        {!history.data.length && (
          <p className="text-muted-foreground text-sm">
            No hay registros de cobro en esta página.
          </p>
        )}
        <div className="flex justify-between text-sm">
          <span>
            {history.totalCount} registros · página {history.page}
          </span>
          <div className="flex gap-3">
            {page > 1 && <Link href={`?page=${page - 1}`}>Anterior</Link>}
            {page * history.pageSize < history.totalCount && (
              <Link href={`?page=${page + 1}`}>Siguiente</Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
