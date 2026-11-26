"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  cancelMeliPaymentPreparationAction,
  getMeliPreparationActorAction,
  inspectMeliPaymentDispatchAction,
  inspectMeliPaymentReversalsAction,
  prepareMeliPaymentAction,
  publishMeliPaymentPreparationAction,
} from "@/modules/mercadolibre/actions/meli-payment-preparations.action";
import type {
  inspectMeliPaymentReversals,
  listMeliPaymentPreparations,
} from "@/modules/mercadolibre/service/meli-payment-preparations.service";
import {
  type MeliPaymentAttempt,
  meliPaymentAttemptStorageKey,
  readMeliPaymentAttempt,
  saveMeliPaymentAttempt,
} from "@/modules/mercadolibre/utils/accounting-payment-attempt";

type Preparation = Awaited<
  ReturnType<typeof listMeliPaymentPreparations>
>[number];
type Reversals = NonNullable<
  Awaited<ReturnType<typeof inspectMeliPaymentReversals>>
>;

export function MeliReversalInspection({
  reversals,
}: {
  reversals: Reversals;
}) {
  return (
    <div>
      <p>
        {reversals.status === "VOIDED"
          ? `Anulación comercial finalizada; fecha de reversión ${reversals.date}.`
          : `Reversión reservada para ${reversals.date}; la anulación comercial no está finalizada.`}{" "}
        La consulta no confirma reversión alguna.
      </p>
      <ul>
        {reversals.components.map((component) => (
          <li key={component.key}>
            {component.description}:{" "}
            {component.reversalEntryId
              ? `contra-asiento ${component.reversalEntryId} ${component.confirmed ? "confirmado" : "encontrado sin confirmar"}`
              : "sin recibo encontrado; puede seguir en curso"}
          </li>
        ))}
      </ul>
      {reversals.historyIssues.length > 0 && (
        <div className="text-destructive" role="alert">
          <p>La historia contable requiere revisión:</p>
          <ul>
            {reversals.historyIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
      <p>
        La historia es una consulta puntual y no garantiza que no existan
        solicitudes en tránsito.
      </p>
    </div>
  );
}

function MeliReversalLookup({
  orgSlug,
  paymentId,
}: {
  orgSlug: string;
  paymentId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] =
    useState<Awaited<ReturnType<typeof inspectMeliPaymentReversals>>>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const running = useRef(false);
  function inspect() {
    if (running.current) {
      return;
    }
    running.current = true;
    setResult(null);
    setMessage("");
    setError("");
    startTransition(async () => {
      try {
        const response = await inspectMeliPaymentReversalsAction(
          orgSlug,
          paymentId
        );
        if (!response.success) {
          setError(response.error);
        } else if (response.data) {
          setResult(response.data);
        } else {
          setMessage(
            "No se encontró una reserva de reversión para este cobro."
          );
        }
      } catch {
        setError("No se pudo consultar la reversión. Reintentá la consulta.");
      } finally {
        running.current = false;
      }
    });
  }
  return (
    <div>
      <Button
        disabled={pending}
        onClick={inspect}
        type="button"
        variant="outline"
      >
        Consultar reversión
      </Button>
      {message && <p>{message}</p>}
      {error && (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      )}
      {result && <MeliReversalInspection reversals={result} />}
    </div>
  );
}

function dispatchLabel(component: Preparation["components"][number]): string {
  if (component.dispatchStatus === "PUBLISHED") {
    return "Publicado";
  }
  if (component.dispatchStatus === "UNCERTAIN") {
    return "Envío pendiente de confirmación";
  }
  return "Sin envío";
}

function shouldShowPreparation({
  active,
  enabled,
  draftId,
  preparations,
  uncertain,
  error,
}: {
  active: Preparation | undefined;
  enabled: boolean;
  draftId: string | undefined;
  preparations: Preparation[];
  uncertain: boolean;
  error: string;
}) {
  return Boolean(
    active || (enabled && draftId) || preparations.length || uncertain || error
  );
}

export function MeliPaymentPreparation({
  orgSlug,
  paymentId,
  draftId,
  enabled,
  preparations,
}: {
  orgSlug: string;
  paymentId: string;
  draftId?: string;
  enabled: boolean;
  preparations: Preparation[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [inspection, setInspection] = useState("");
  const [readyStorageKey, setReadyStorageKey] = useState<string | null>(null);
  const attempt = useRef<MeliPaymentAttempt | null>(null);
  const running = useRef(false);
  const active = preparations.find((item) => item.status === "PREPARED");
  const storageKey = meliPaymentAttemptStorageKey(orgSlug, paymentId);
  const storageReady = readyStorageKey === storageKey;

  useEffect(() => {
    attempt.current = null;
    setUncertain(false);
    setReadyStorageKey(null);
    try {
      attempt.current = readMeliPaymentAttempt(
        window.sessionStorage,
        storageKey,
        paymentId
      );
      setUncertain(attempt.current !== null);
      setReadyStorageKey(storageKey);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo consultar la solicitud guardada."
      );
    }
  }, [storageKey, paymentId]);

  async function getAttempt() {
    if (attempt.current) {
      return attempt.current;
    }
    if (!draftId) {
      throw new Error("No se encontró el desglose activo.");
    }
    const saved = readMeliPaymentAttempt(
      window.sessionStorage,
      storageKey,
      paymentId
    );
    if (saved) {
      attempt.current = saved;
      setUncertain(true);
      throw new Error(
        "Ya hay una solicitud guardada. Reintentá esa solicitud."
      );
    }
    const actor = await getMeliPreparationActorAction(orgSlug);
    if (!actor.success) {
      throw new Error(actor.error);
    }
    attempt.current = saveMeliPaymentAttempt(
      window.sessionStorage,
      storageKey,
      {
        paymentId,
        draftId,
        requestKey: crypto.randomUUID(),
        expectedActorId: actor.data.actorId,
      }
    );
    return attempt.current;
  }

  function prepare() {
    if (running.current || !storageReady || !(draftId || attempt.current)) {
      return;
    }
    running.current = true;
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        const request = await getAttempt();
        const result = await prepareMeliPaymentAction(orgSlug, request);
        if (!result.success) {
          setError(result.error);
          setUncertain(true);
          return;
        }
        window.sessionStorage.removeItem(storageKey);
        attempt.current = null;
        setUncertain(false);
        if (result.refreshRequired) {
          setMessage(
            "Preparación confirmada. Actualizá la página para consultar su estado."
          );
        }
        router.refresh();
      } catch (cause) {
        setUncertain(attempt.current !== null);
        setError(
          cause instanceof Error
            ? `${cause.message} Consultá el estado antes de iniciar otra solicitud.`
            : "No se obtuvo respuesta. Consultá el estado y reintentá la misma solicitud."
        );
      } finally {
        running.current = false;
      }
    });
  }

  function cancel(id: string) {
    if (running.current || !storageReady || uncertain) {
      return;
    }
    running.current = true;
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        const result = await cancelMeliPaymentPreparationAction(orgSlug, id);
        if (!result.success) {
          setError(result.error);
          return;
        }
        if (result.refreshRequired) {
          setMessage(
            "Cancelación confirmada. Actualizá la página para consultar su estado."
          );
        }
        router.refresh();
      } catch {
        setError(
          "No se confirmó la cancelación. Consultá el estado y reintentá."
        );
      } finally {
        running.current = false;
      }
    });
  }

  function inspect(preparationId: string, componentKey: string) {
    if (running.current) {
      return;
    }
    running.current = true;
    setError("");
    setInspection("");
    startTransition(async () => {
      try {
        const result = await inspectMeliPaymentDispatchAction(orgSlug, {
          paymentId,
          preparationId,
          componentKey,
        });
        if (!result.success) {
          setError(result.error);
          return;
        }
        const { journalEntryId, dispatchStatus } = result.data;
        if (!journalEntryId) {
          setInspection(
            `${componentKey}: no se encontró el asiento. El envío aún puede estar en tránsito; conservá la misma clave y datos.`
          );
          return;
        }
        setInspection(
          `${componentKey}: asiento ${journalEntryId} verificado; estado del envío ${dispatchStatus}. Esta consulta no confirma ni modifica la publicación.`
        );
      } catch {
        setError("No se pudo verificar el envío. Reintentá la consulta.");
      } finally {
        running.current = false;
      }
    });
  }

  function publish(preparationId: string) {
    if (running.current) {
      return;
    }
    running.current = true;
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        const result = await publishMeliPaymentPreparationAction(orgSlug, {
          paymentId,
          preparationId,
        });
        if (!result.success) {
          setError(result.error);
          router.refresh();
          return;
        }
        setMessage(
          result.refreshRequired
            ? "Conceptos confirmados. Actualizá la página para consultar sus estados."
            : "Todos los conceptos de la preparación figuran publicados."
        );
        router.refresh();
      } catch {
        setError(
          "No se confirmó el resultado de la publicación. Algunos conceptos pueden haberse publicado; consultá sus estados y reintentá con la misma preparación."
        );
        router.refresh();
      } finally {
        running.current = false;
      }
    });
  }

  if (
    !shouldShowPreparation({
      active,
      enabled,
      draftId,
      preparations,
      uncertain,
      error,
    })
  ) {
    return null;
  }
  return (
    <div className="space-y-2">
      {active ? (
        <>
          <p>
            Desglose preparado; el cobro no se puede anular. Para modificarlo,
            cancelá la preparación si aún no hay envíos.
          </p>
          <ul>
            {active.components.map((component) => (
              <li key={component.key}>
                {component.description}: {component.amount} ·{" "}
                {dispatchLabel(component)}
                {component.dispatchStatus && (
                  <Button
                    disabled={pending}
                    onClick={() => inspect(active.id, component.key)}
                    type="button"
                    variant="outline"
                  >
                    Verificar envío {component.description}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {active.components.some(
            (component) => component.dispatchStatus !== "PUBLISHED"
          ) && (
            <>
              <p>
                Se publica un asiento por concepto; si hay un error, los
                publicados se conservan.
              </p>
              <Button
                disabled={pending}
                onClick={() => publish(active.id)}
                type="button"
                variant="outline"
              >
                Confirmar asiento
              </Button>
            </>
          )}
          <Button
            disabled={
              pending ||
              !storageReady ||
              uncertain ||
              active.components.some((item) => item.dispatchStatus)
            }
            onClick={() => cancel(active.id)}
            type="button"
            variant="outline"
          >
            Cancelar preparación
          </Button>
          {active.components.some((item) => item.dispatchStatus) && (
            <>
              <p>
                La preparación tiene envíos y requiere recuperación o reversión.
              </p>
              <MeliReversalLookup orgSlug={orgSlug} paymentId={paymentId} />
            </>
          )}
        </>
      ) : null}
      {enabled && (uncertain || (!active && draftId)) && (
        <Button
          disabled={pending || !storageReady}
          onClick={prepare}
          type="button"
          variant="outline"
        >
          {uncertain
            ? "Reintentar la misma preparación"
            : "Preparar conceptos sin publicar"}
        </Button>
      )}
      {error && (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      )}
      {uncertain && (
        <p>
          La solicitud se conserva en esta pestaña. Reintentala con el usuario
          original; cerrar la pestaña elimina esta copia.
        </p>
      )}
      {message && <output>{message}</output>}
      {inspection && <output>{inspection}</output>}
    </div>
  );
}
