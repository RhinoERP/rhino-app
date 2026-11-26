"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { MeliFiscalMonetaryPreview } from "@/components/mercadolibre/meli-fiscal-monetary-preview";
import { MeliFiscalPreparation } from "@/components/mercadolibre/meli-fiscal-preparation";
import { Button } from "@/components/ui/button";
import {
  getMeliFiscalAccountingSnapshotAction,
  inspectMeliFiscalPostingPeriodAction,
  inspectMeliInvoiceReceiptAction,
  listMeliFiscalJournalEntriesAction,
} from "@/modules/mercadolibre/actions/meli-fiscal-accounting-history.action";
import { changeMeliPostingPeriodAction } from "@/modules/mercadolibre/actions/meli-period.action";
import {
  type MeliPeriodAttempt,
  meliPeriodAttemptStorageKey,
  readMeliPeriodAttempt,
} from "@/modules/mercadolibre/utils/accounting-period-attempt";

type Origin =
  | { type: "invoice"; saleId: string }
  | { type: "creditNote"; saleId: string; creditNoteId: string };
type Result = Awaited<ReturnType<typeof listMeliFiscalJournalEntriesAction>>;
type SnapshotResult = Awaited<
  ReturnType<typeof getMeliFiscalAccountingSnapshotAction>
>;

function MeliFiscalPeriodReview({
  orgSlug,
  origin,
}: {
  orgSlug: string;
  origin: Origin;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof inspectMeliFiscalPostingPeriodAction>
  > | null>(null);
  const [reason, setReason] = useState("");
  const [changeError, setChangeError] = useState("");
  const [changeMessage, setChangeMessage] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const attempt = useRef<MeliPeriodAttempt | null>(null);
  const running = useRef(false);
  const storageKey = meliPeriodAttemptStorageKey(orgSlug, origin);

  useEffect(() => {
    try {
      attempt.current = readMeliPeriodAttempt(
        window.sessionStorage,
        storageKey
      );
      setUncertain(attempt.current !== null);
      setStorageReady(true);
    } catch (error) {
      setStorageError(
        error instanceof Error
          ? error.message
          : "No se pudo consultar la solicitud de período guardada."
      );
    }
  }, [storageKey]);

  function inspectPeriod() {
    if (running.current) {
      return;
    }
    startTransition(async () => {
      try {
        setResult(await inspectMeliFiscalPostingPeriodAction(orgSlug, origin));
      } catch {
        setResult({
          success: false,
          error: "No se obtuvo respuesta. Reintentá la consulta.",
        });
      }
    });
  }

  function prepareAttempt() {
    if (!result?.success) {
      return null;
    }
    if (reason.trim().length < 5 || reason.trim().length > 500) {
      setChangeError("Ingresá un motivo de entre 5 y 500 caracteres.");
      return null;
    }
    const request: MeliPeriodAttempt = {
      periodStart: `${result.data.date.slice(0, 7)}-01`,
      expectedStatus: result.data.status,
      newStatus: result.data.status === "OPEN" ? "CLOSED" : "OPEN",
      reason: reason.trim(),
      requestKey: crypto.randomUUID(),
      expectedActorId: result.actorId,
    };
    try {
      const existing = readMeliPeriodAttempt(window.sessionStorage, storageKey);
      if (existing) {
        attempt.current = existing;
        setUncertain(true);
        setChangeError(
          "Ya hay una solicitud guardada. Recuperá esa solicitud antes de iniciar otra."
        );
        return null;
      }
      window.sessionStorage.setItem(storageKey, JSON.stringify(request));
      const saved = readMeliPeriodAttempt(window.sessionStorage, storageKey);
      if (JSON.stringify(saved) !== JSON.stringify(request)) {
        throw new Error("No se guardó la solicitud exacta.");
      }
      attempt.current = request;
      return request;
    } catch {
      setStorageReady(false);
      setStorageError(
        "No se pudo guardar la solicitud de forma recuperable. No se envió el cambio; revisá el almacenamiento de esta pestaña."
      );
      return null;
    }
  }

  function changePeriod() {
    if (running.current || !storageReady) {
      return;
    }
    const request = attempt.current ?? prepareAttempt();
    if (!request) {
      return;
    }
    running.current = true;
    setChangeError("");
    setChangeMessage("");
    startTransition(async () => {
      try {
        const response = await changeMeliPostingPeriodAction(orgSlug, request);
        if (!response.success) {
          setResult(null);
          setChangeError(response.error);
          setUncertain(true);
          return;
        }
        window.sessionStorage.removeItem(storageKey);
        attempt.current = null;
        setUncertain(false);
        setReason("");
        setResult(null);
        setChangeMessage(
          "Cambio registrado. Consultá nuevamente el período para conocer su estado actual."
        );
      } catch (error) {
        setUncertain(true);
        setChangeError(
          error instanceof Error ? error.message : "No se confirmó el cambio."
        );
      } finally {
        running.current = false;
      }
    });
  }

  const labels = {
    OPEN: "abierto",
    CLOSED: "cerrado",
    UNCONFIGURED: "no configurado",
  };
  let changeLabel = "Abrir período Meli";
  if (uncertain) {
    changeLabel = "Reintentar el mismo cambio";
  } else if (result?.success && result.data.status === "OPEN") {
    changeLabel = "Cerrar período Meli";
  }
  return (
    <div>
      <Button
        disabled={pending}
        onClick={inspectPeriod}
        type="button"
        variant="outline"
      >
        {pending ? "Consultando período…" : "Consultar período fiscal"}
      </Button>
      {result && !result.success && (
        <p className="text-destructive" role="alert">
          No se pudo consultar el período: {result.error}
        </p>
      )}
      {result?.success && (
        <>
          <p>
            Fecha fiscal {result.data.date} · período{" "}
            {labels[result.data.status]}. La disponibilidad puede cambiar antes
            de contabilizar; esta consulta no autoriza ni crea asientos.
          </p>
          <label className="block">
            Motivo del cambio de período
            <input
              className="block w-full rounded-md border bg-background p-2"
              disabled={pending || uncertain || !storageReady}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            />
          </label>
          <Button
            disabled={pending || !storageReady}
            onClick={changePeriod}
            type="button"
            variant="outline"
          >
            {changeLabel}
          </Button>
        </>
      )}
      {uncertain && !result?.success && (
        <Button
          disabled={pending || !storageReady}
          onClick={changePeriod}
          type="button"
          variant="outline"
        >
          Reintentar el mismo cambio
        </Button>
      )}
      {uncertain && (
        <p>
          La solicitud se conserva en esta pestaña, incluso al recargar. Período{" "}
          {attempt.current?.periodStart}, de {attempt.current?.expectedStatus} a{" "}
          {attempt.current?.newStatus}. Motivo: {attempt.current?.reason}.
          Reintentá con el usuario original y la misma clave{" "}
          {attempt.current?.requestKey}; una consulta aislada no descarta
          operaciones en tránsito. Si cerrás la pestaña, anotá la clave y
          consultá la auditoría.
        </p>
      )}
      {storageError && (
        <p className="text-destructive" role="alert">
          {storageError}
        </p>
      )}
      {changeMessage && <p>{changeMessage}</p>}
      {changeError && (
        <p className="text-destructive" role="alert">
          {changeError}
        </p>
      )}
    </div>
  );
}

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
  orgId,
  orgSlug,
  origin,
}: {
  orgId: string;
  orgSlug: string;
  origin: Origin;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const [snapshotPending, startSnapshotTransition] = useTransition();
  const [snapshot, setSnapshot] = useState<SnapshotResult | null>(null);
  const [receiptPending, startReceiptTransition] = useTransition();
  const [receipt, setReceipt] = useState<Awaited<
    ReturnType<typeof inspectMeliInvoiceReceiptAction>
  > | null>(null);

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

  function inspectReceipt() {
    startReceiptTransition(async () => {
      try {
        setReceipt(
          await inspectMeliInvoiceReceiptAction(orgSlug, origin.saleId)
        );
      } catch {
        setReceipt({
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
      <MeliFiscalPeriodReview
        key={meliPeriodAttemptStorageKey(orgSlug, origin)}
        orgSlug={orgSlug}
        origin={origin}
      />
      <MeliFiscalPreparation orgSlug={orgSlug} origin={origin} />
      {origin.type === "invoice" && (
        <div className="space-y-1">
          <Button
            disabled={receiptPending}
            onClick={inspectReceipt}
            type="button"
            variant="outline"
          >
            {receiptPending
              ? "Verificando asiento…"
              : "Verificar asiento fiscal Meli"}
          </Button>
          {receipt && !receipt.success && (
            <p className="text-destructive" role="alert">
              No se pudo verificar el asiento: {receipt.error}
            </p>
          )}
          {receipt?.success && (
            <p>
              {receipt.data
                ? `Coinciden los importes y el recibo del asiento ${receipt.data.journalEntryId}. Las cuentas de ventas e impuestos requieren revisión manual.`
                : "No se encontró un recibo de factura Meli; esto no descarta asientos externos ni solicitudes en tránsito."}
            </p>
          )}
        </div>
      )}
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
          <MeliFiscalMonetaryPreview
            key={JSON.stringify(snapshot.data)}
            orgId={orgId}
            orgSlug={orgSlug}
            origin={origin}
            snapshot={snapshot.data}
          />
        </div>
      )}
    </div>
  );
}
