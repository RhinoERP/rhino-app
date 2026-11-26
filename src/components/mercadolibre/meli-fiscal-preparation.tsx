"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  getMeliFiscalPreparationAction,
  inspectMeliFiscalDispatchAction,
  prepareMeliFiscalAction,
} from "@/modules/mercadolibre/actions/meli-fiscal-preparation.action";
import {
  type MeliFiscalAttempt,
  meliFiscalAttemptStorageKey,
  readMeliFiscalAttempt,
  saveMeliFiscalAttempt,
} from "@/modules/mercadolibre/utils/accounting-fiscal-attempt";

type Origin =
  | { type: "invoice"; saleId: string }
  | { type: "creditNote"; saleId: string; creditNoteId: string };

function inspectionMessage(data: {
  dispatchStatus: "UNCERTAIN" | "PUBLISHED" | null;
  journalEntryId: string | null;
}) {
  if (data.dispatchStatus === null) {
    return "No se encontró un envío fiscal. La consulta de historia no descarta asientos vinculados a otro origen ni solicitudes en tránsito.";
  }
  if (!data.journalEntryId) {
    return "Envío sin confirmar y sin recibo encontrado. Puede seguir en curso; conservá la solicitud original.";
  }
  if (data.dispatchStatus === "UNCERTAIN") {
    return `Recibo contable ${data.journalEntryId} encontrado; el envío sigue sin confirmar. Requiere recuperación.`;
  }
  return `Recibo contable ${data.journalEntryId} verificado. La consulta no certifica la conciliación ni las cuentas fiscales.`;
}

export function MeliFiscalPreparation({
  orgSlug,
  origin,
}: {
  orgSlug: string;
  origin: Origin;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [historyIssues, setHistoryIssues] = useState<string[]>([]);
  const [readyStorageKey, setReadyStorageKey] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const attempt = useRef<MeliFiscalAttempt | null>(null);
  const running = useRef(false);
  const storageKey = meliFiscalAttemptStorageKey(orgSlug, origin);
  const storageReady = readyStorageKey === storageKey;

  useEffect(() => {
    attempt.current = null;
    setUncertain(false);
    setReadyStorageKey(null);
    try {
      attempt.current = readMeliFiscalAttempt(
        window.sessionStorage,
        storageKey
      );
      setUncertain(attempt.current !== null);
      setReadyStorageKey(storageKey);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo consultar la solicitud fiscal guardada."
      );
    }
  }, [storageKey]);

  async function getAttempt() {
    if (attempt.current) {
      return attempt.current;
    }
    const existing = await getMeliFiscalPreparationAction(orgSlug, origin);
    if (!existing.success) {
      throw new Error(existing.error);
    }
    if (existing.data.preparation) {
      setMessage(
        `Preparación fiscal ${existing.data.preparation.preparationId} existente. No implica que haya un asiento.`
      );
      return null;
    }
    const saved = readMeliFiscalAttempt(window.sessionStorage, storageKey);
    if (saved) {
      attempt.current = saved;
      setUncertain(true);
      throw new Error(
        "Ya hay una solicitud guardada. Reintentá esa solicitud antes de iniciar otra."
      );
    }
    const request: MeliFiscalAttempt = {
      requestKey: crypto.randomUUID(),
      expectedActorId: existing.data.actorId,
    };
    attempt.current = saveMeliFiscalAttempt(
      window.sessionStorage,
      storageKey,
      request
    );
    return attempt.current;
  }

  function prepare() {
    if (running.current || !storageReady) {
      return;
    }
    running.current = true;
    setError("");
    setMessage("");
    setHistoryIssues([]);
    startTransition(async () => {
      try {
        const request = await getAttempt();
        if (!request) {
          return;
        }
        const result = await prepareMeliFiscalAction(orgSlug, origin, request);
        if (!result.success) {
          setUncertain(true);
          setError(result.error);
          return;
        }
        window.sessionStorage.removeItem(storageKey);
        attempt.current = null;
        setUncertain(false);
        setMessage(
          `Preparación fiscal ${result.data.preparationId} guardada. No se creó ningún asiento.`
        );
      } catch (cause) {
        setUncertain(attempt.current !== null);
        setError(
          cause instanceof Error
            ? `${cause.message} Consultá el estado o reintentá con la misma clave.`
            : "No se confirmó la preparación. Consultá el estado o reintentá con la misma clave."
        );
      } finally {
        running.current = false;
      }
    });
  }

  function inspect() {
    if (running.current) {
      return;
    }
    running.current = true;
    setError("");
    setMessage("");
    setHistoryIssues([]);
    startTransition(async () => {
      try {
        const result = await inspectMeliFiscalDispatchAction(orgSlug, origin);
        if (!result.success) {
          setError(result.error);
          return;
        }
        setMessage(inspectionMessage(result.data));
        setHistoryIssues(result.data?.historyIssues ?? []);
      } catch {
        setError(
          "No se pudo consultar el envío fiscal. Reintentá la consulta."
        );
      } finally {
        running.current = false;
      }
    });
  }

  let prepareLabel = "Preparar fuente fiscal";
  if (pending) {
    prepareLabel = "Consultando preparación…";
  } else if (uncertain) {
    prepareLabel = "Reintentar la misma preparación";
  }
  return (
    <div className="space-y-2">
      <Button
        disabled={pending || !storageReady}
        onClick={prepare}
        type="button"
        variant="outline"
      >
        {prepareLabel}
      </Button>
      <Button
        disabled={pending}
        onClick={inspect}
        type="button"
        variant="outline"
      >
        Consultar envío fiscal
      </Button>
      {message && <p>{message}</p>}
      {uncertain && (
        <p>
          Hay una solicitud guardada en esta pestaña. Reintentala con el usuario
          original; cerrar la pestaña elimina esta copia.
        </p>
      )}
      {historyIssues.length > 0 && (
        <div className="text-destructive" role="alert">
          <p>La historia contable requiere revisión:</p>
          <ul>
            {historyIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
