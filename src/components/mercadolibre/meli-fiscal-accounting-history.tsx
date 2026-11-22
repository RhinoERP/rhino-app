"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  getMeliFiscalAccountingSnapshotAction,
  listMeliFiscalJournalEntriesAction,
} from "@/modules/mercadolibre/actions/meli-fiscal-accounting-history.action";

type Origin =
  | { type: "invoice"; saleId: string }
  | { type: "creditNote"; saleId: string; creditNoteId: string };
type Result = Awaited<ReturnType<typeof listMeliFiscalJournalEntriesAction>>;
type SnapshotResult = Awaited<
  ReturnType<typeof getMeliFiscalAccountingSnapshotAction>
>;

export function MeliFiscalAccountingHistoryResult({
  result,
}: {
  result: Result;
}) {
  if (!result.success) {
    return (
      <p className="text-destructive" role="alert">
        No se pudo consultar la historia contable: {result.error}
      </p>
    );
  }
  if (result.data.length === 0) {
    return (
      <p>
        No se encontraron asientos con este comprobante como origen. Los
        asientos externos o vinculados a otro origen requieren revisión manual.
      </p>
    );
  }
  return (
    <>
      <p>
        Revisá los asientos y contra-asientos. Esta consulta no confirma que el
        comprobante esté correctamente contabilizado.
      </p>
      <ul className="space-y-2">
        {result.data.map((entry) => (
          <li className="break-all" key={entry.id}>
            {entry.tipo_evento === "CONTRA_ASIENTO"
              ? "Contra-asiento"
              : (entry.tipo_evento ?? "Asiento sin tipo")}
            {" · "}
            {entry.estado} · fecha {entry.fecha} · ID {entry.id}
            {entry.tipo_evento === "CONTRA_ASIENTO" && (
              <p>Asiento original: {entry.referencia_id}</p>
            )}
            {entry.anulado_por_id && (
              <p>Vinculado a reversión: {entry.anulado_por_id}</p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

export function MeliFiscalAccountingHistory({
  orgSlug,
  origin,
}: {
  orgSlug: string;
  origin: Origin;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const [snapshotPending, startSnapshotTransition] = useTransition();
  const [snapshot, setSnapshot] = useState<SnapshotResult | null>(null);

  function load() {
    startTransition(async () => {
      try {
        setResult(await listMeliFiscalJournalEntriesAction(orgSlug, origin));
      } catch {
        setResult({
          success: false,
          error: "No se obtuvo respuesta. Reintentá la consulta.",
        });
      }
    });
  }

  function loadSnapshot() {
    startSnapshotTransition(async () => {
      try {
        setSnapshot(
          await getMeliFiscalAccountingSnapshotAction(orgSlug, origin)
        );
      } catch {
        setSnapshot({
          success: false,
          error: "No se obtuvo respuesta. Reintentá la consulta.",
        });
      }
    });
  }

  return (
    <div className="space-y-2 text-sm">
      <Button disabled={pending} onClick={load} type="button" variant="outline">
        {pending ? "Consultando asientos…" : "Consultar asientos vinculados"}
      </Button>
      {result && <MeliFiscalAccountingHistoryResult result={result} />}
      <Button
        disabled={snapshotPending}
        onClick={loadSnapshot}
        type="button"
        variant="outline"
      >
        {snapshotPending
          ? "Consultando comprobante…"
          : "Revisar datos fiscales"}
      </Button>
      {snapshot && !snapshot.success && (
        <p className="text-destructive" role="alert">
          No se pudo preparar la revisión fiscal: {snapshot.error}
        </p>
      )}
      {snapshot?.success && (
        <div className="space-y-1">
          <p>
            Datos fiscales autorizados, no un asiento. Las cuentas y su
            imputación requieren revisión antes de contabilizar.
          </p>
          <p>
            Fecha {snapshot.data.date} · moneda {snapshot.data.currency} ·
            cotización fiscal {snapshot.data.exchangeRate}
          </p>
          <p>
            Total {snapshot.data.total} · neto {snapshot.data.net} · exento{" "}
            {snapshot.data.exempt} · no gravado {snapshot.data.nonTaxable}
          </p>
          <p>
            IVA {snapshot.data.vat} · otros tributos {snapshot.data.otherTaxes}
          </p>
          {snapshot.data.vatItems.length > 0 && (
            <p>
              Detalle IVA:{" "}
              {snapshot.data.vatItems
                .map((tax) => `ARCA ${tax.id}: ${tax.amount}`)
                .join("; ")}
            </p>
          )}
          {snapshot.data.tributeItems.length > 0 && (
            <p>
              Detalle tributos:{" "}
              {snapshot.data.tributeItems
                .map(
                  (tax) => `ARCA ${tax.id} ${tax.description}: ${tax.amount}`
                )
                .join("; ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
