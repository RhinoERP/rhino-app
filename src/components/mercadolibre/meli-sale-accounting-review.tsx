"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { reviewMeliSaleAccountingAction } from "@/modules/mercadolibre/actions/meli-sale-accounting-review.action";

type Result = Awaited<ReturnType<typeof reviewMeliSaleAccountingAction>>;

export function MeliSaleAccountingReviewResult({ result }: { result: Result }) {
  if (!result.success) {
    return (
      <p className="text-destructive" role="alert">
        No se pudo completar la revisión: {result.error}
      </p>
    );
  }
  const { data } = result;
  return (
    <div className="space-y-2">
      <p>
        Esta revisión reúne consultas separadas; no bloquea cambios, no descarta
        asientos vinculados a otros orígenes ni solicitudes en tránsito y no
        autoriza publicar o anular.
      </p>
      {data.issues.length > 0 && <ReviewIssues issues={data.issues} />}
      <p>
        Factura: {data.amount} {data.currency} · estado fiscal{" "}
        {data.invoiceStatus} · envío{" "}
        {data.invoice.dispatchStatus ?? "sin envío"}
      </p>
      <ReviewIssues issues={data.invoice.issues} />
      <p>Notas de crédito: {data.notes.length}</p>
      <ul className="space-y-2">
        {data.notes.map((note) => (
          <li className="break-all" key={note.id}>
            Nota {note.id} · {note.amount} {note.currency} · {note.status} ·
            fiscal {note.fiscalStatus} · envío{" "}
            {note.dispatchStatus ?? "sin envío"}
            <ReviewIssues issues={note.issues} />
          </li>
        ))}
      </ul>
      <p>Cobros registrados o anulados: {data.payments.length}</p>
      <ul className="space-y-2">
        {data.payments.map((payment) => (
          <li className="break-all" key={payment.id}>
            Cobro {payment.id} · {payment.amount} {payment.currency} ·{" "}
            {payment.status} · reversión{" "}
            {payment.reversalStatus ?? "sin reserva"}
            <ul>
              {payment.components.map((component) => (
                <li key={`${component.preparationId}:${component.key}`}>
                  {component.description}:{" "}
                  {component.dispatchStatus ?? "sin envío"}
                </li>
              ))}
            </ul>
            <ReviewIssues issues={payment.issues} />
          </li>
        ))}
      </ul>
      <p>
        Los importes mostrados son operativos; no representan el saldo contable.
        No se calculan diferencias de cambio ni se infieren reembolsos.
      </p>
    </div>
  );
}

function ReviewIssues({ issues }: { issues: string[] }) {
  if (issues.length === 0) {
    return <p>Sin discrepancias detectadas en estas consultas.</p>;
  }
  return (
    <ul className="list-disc pl-5 text-destructive">
      {issues.map((issue) => (
        <li key={issue}>{issue}</li>
      ))}
    </ul>
  );
}

export function MeliSaleAccountingReview({
  orgSlug,
  saleId,
}: {
  orgSlug: string;
  saleId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);

  function review() {
    startTransition(async () => {
      try {
        setResult(await reviewMeliSaleAccountingAction(orgSlug, saleId));
      } catch {
        setResult({
          success: false,
          error: "No se obtuvo respuesta. Reintentá la revisión.",
        });
      }
    });
  }

  return (
    <div className="space-y-2 text-sm">
      <Button
        disabled={pending}
        onClick={review}
        type="button"
        variant="outline"
      >
        {pending ? "Revisando venta…" : "Revisar contabilidad de la venta"}
      </Button>
      {result && <MeliSaleAccountingReviewResult result={result} />}
    </div>
  );
}
