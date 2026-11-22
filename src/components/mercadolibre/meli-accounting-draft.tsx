"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ZodError } from "zod";
import { MeliAccountingDraftPreview } from "@/components/mercadolibre/meli-accounting-draft-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCuentas } from "@/modules/accounting/queries/queries.client";
import { saveMeliAccountingDraftAction } from "@/modules/mercadolibre/actions/meli-accounting-drafts.action";
import type { listMeliAccountingDrafts } from "@/modules/mercadolibre/service/meli-accounting-drafts.service";
import {
  type MeliAccountingBreakdown,
  meliAccountingBreakdownSchema,
} from "@/modules/mercadolibre/utils/accounting-breakdown";

type Draft = Awaited<ReturnType<typeof listMeliAccountingDrafts>>[number];
type ManualConcept = NonNullable<
  MeliAccountingBreakdown["manualConcepts"]
>[number];
type EditableConcept = ManualConcept & { key: string };
type Attempt = {
  paymentId: string;
  idempotencyKey: string;
  expectedVersion: number;
  breakdown: MeliAccountingBreakdown;
  evidence: string;
};

const fields = [
  { key: "net", label: "Neto acreditado" },
  { key: "discount", label: "Descuento" },
  { key: "commission", label: "Comisión" },
  { key: "shipping", label: "Envío" },
] as const;

function validationMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "Revisá el desglose.";
  }
  return error instanceof Error ? error.message : "Revisá el desglose.";
}

function DraftHistory({ history }: { history: Draft[] }) {
  if (!history.length) {
    return null;
  }
  return (
    <details>
      <summary className="cursor-pointer">Historial de versiones</summary>
      <ul className="mt-2 space-y-2">
        {history.map((draft) => (
          <li key={draft.id}>
            Versión {draft.version} {draft.active ? "(activa)" : ""} ·{" "}
            {draft.created_at} · responsable {draft.created_by}
            <p>
              Neto {draft.request_payload.breakdown.net}; descuento{" "}
              {draft.request_payload.breakdown.discount}; comisión{" "}
              {draft.request_payload.breakdown.commission}; envío{" "}
              {draft.request_payload.breakdown.shipping}.
            </p>
            {draft.request_payload.breakdown.manualConcepts?.map(
              (concept, index) => (
                <p key={`${draft.id}-${index}`}>
                  {concept.description}: {concept.direction} {concept.amount} ·
                  cuenta {concept.accountId}
                </p>
              )
            )}
            {draft.request_payload.evidence && (
              <p>Evidencia: {draft.request_payload.evidence}</p>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function ActiveDraftPreview({ draft }: { draft: Draft | undefined }) {
  if (!draft) {
    return null;
  }
  return (
    <MeliAccountingDraftPreview
      breakdown={draft.request_payload.breakdown}
      currency={draft.currency}
      grossAmount={draft.gross_amount}
    />
  );
}

export function MeliAccountingDraft({
  orgSlug,
  orgId,
  paymentId,
  currency,
  history,
  editable,
}: {
  orgSlug: string;
  orgId: string;
  paymentId: string;
  currency: "ARS" | "USD";
  history: Draft[];
  editable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const running = useRef(false);
  const attempt = useRef<Attempt | null>(null);
  const active = history.find((draft) => draft.active);
  const expectedVersion = history[0]?.version ?? 0;
  const [values, setValues] = useState(
    active?.request_payload.breakdown ?? {
      net: "0",
      discount: "0",
      commission: "0",
      shipping: "0",
    }
  );
  const [evidence, setEvidence] = useState(
    active?.request_payload.evidence ?? ""
  );
  const [manualConcepts, setManualConcepts] = useState<EditableConcept[]>(() =>
    (active?.request_payload.breakdown.manualConcepts ?? []).map(
      (concept, index) => ({ ...concept, key: `existing-${index}` })
    )
  );
  const accounts = useCuentas(orgId, { enabled: open && editable });
  const availableAccounts = (accounts.data ?? []).filter(
    (account) => account.activa && account.permite_movimientos
  );
  const submitLabel = locked
    ? "Confirmar el mismo intento"
    : "Guardar borrador";

  function updateConcept(key: string, patch: Partial<ManualConcept>) {
    setManualConcepts((concepts) =>
      concepts.map((concept) =>
        concept.key === key ? { ...concept, ...patch } : concept
      )
    );
  }

  function submit() {
    if (running.current) {
      return;
    }
    if (!attempt.current) {
      try {
        if (
          manualConcepts.some(
            (concept) =>
              !availableAccounts.some(
                (account) => account.id === concept.accountId
              )
          )
        ) {
          throw new Error(
            "Seleccioná una cuenta activa con movimientos para cada ajuste."
          );
        }
        const breakdown = meliAccountingBreakdownSchema.parse({
          ...values,
          manualConcepts: manualConcepts.map(({ key: _key, ...item }) => item),
        });
        attempt.current = {
          paymentId,
          idempotencyKey: crypto.randomUUID(),
          expectedVersion,
          breakdown,
          evidence,
        };
      } catch (validationError) {
        setError(validationMessage(validationError));
        return;
      }
    }
    const request = attempt.current;
    running.current = true;
    setLocked(true);
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        const result = await saveMeliAccountingDraftAction(orgSlug, request);
        if (!result.success) {
          setError(result.error);
          if (result.canEdit) {
            attempt.current = null;
            setLocked(false);
          }
          return;
        }
        attempt.current = null;
        setLocked(false);
        setMessage(
          `Borrador versión ${result.data.version} guardado. No se generaron asientos.`
        );
        toast.success(
          result.refreshRequired
            ? "Borrador guardado. Actualizá la página para consultar su estado."
            : `Borrador versión ${result.data.version} guardado; no se generaron asientos.`
        );
        router.refresh();
      } catch {
        setError(
          "No se obtuvo confirmación. Reintentá sin modificar los datos para recuperar el mismo intento."
        );
      } finally {
        running.current = false;
      }
    });
  }

  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer font-medium">
        Desglose contable (borrador)
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-muted-foreground">
          Este borrador no publica asientos. El importe y la fecha corresponden
          al cobro registrado; el cuadre se verifica al guardar.
        </p>
        <DraftHistory history={history} />
        <ActiveDraftPreview draft={active} />
        {editable && (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <fieldset disabled={pending || locked}>
              <div className="grid gap-3 sm:grid-cols-2">
                {fields.map((field) => (
                  <div className="space-y-1" key={field.key}>
                    <Label htmlFor={`${paymentId}-${field.key}`}>
                      {field.label} ({currency})
                    </Label>
                    <Input
                      id={`${paymentId}-${field.key}`}
                      inputMode="decimal"
                      onChange={(event) =>
                        setValues({
                          ...values,
                          [field.key]: event.target.value,
                        })
                      }
                      value={values[field.key]}
                    />
                  </div>
                ))}
              </div>
              {manualConcepts.map((concept) => (
                <div
                  className="mt-3 grid gap-2 rounded-md border p-3"
                  key={concept.key}
                >
                  <Label htmlFor={`${paymentId}-${concept.key}-description`}>
                    Descripción del ajuste
                  </Label>
                  <Input
                    id={`${paymentId}-${concept.key}-description`}
                    maxLength={200}
                    onChange={(event) =>
                      updateConcept(concept.key, {
                        description: event.target.value,
                      })
                    }
                    value={concept.description}
                  />
                  <Label htmlFor={`${paymentId}-${concept.key}-account`}>
                    Cuenta contable
                  </Label>
                  <select
                    className="rounded-md border bg-background p-2"
                    id={`${paymentId}-${concept.key}-account`}
                    onChange={(event) =>
                      updateConcept(concept.key, {
                        accountId: event.target.value,
                      })
                    }
                    value={concept.accountId}
                  >
                    <option value="">Seleccioná una cuenta</option>
                    {concept.accountId &&
                      !availableAccounts.some(
                        (account) => account.id === concept.accountId
                      ) && (
                        <option value={concept.accountId}>
                          Cuenta no disponible: {concept.accountId}
                        </option>
                      )}
                    {availableAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.codigo} · {account.nombre}
                      </option>
                    ))}
                  </select>
                  <Label htmlFor={`${paymentId}-${concept.key}-amount`}>
                    Importe del ajuste
                  </Label>
                  <Input
                    id={`${paymentId}-${concept.key}-amount`}
                    inputMode="decimal"
                    onChange={(event) =>
                      updateConcept(concept.key, { amount: event.target.value })
                    }
                    value={concept.amount}
                  />
                  <Label htmlFor={`${paymentId}-${concept.key}-direction`}>
                    Signo en el desglose
                  </Label>
                  <select
                    className="rounded-md border bg-background p-2"
                    id={`${paymentId}-${concept.key}-direction`}
                    onChange={(event) =>
                      updateConcept(concept.key, {
                        direction:
                          event.target.value === "SUBTRACT"
                            ? "SUBTRACT"
                            : "ADD",
                      })
                    }
                    value={concept.direction}
                  >
                    <option value="ADD">Suma</option>
                    <option value="SUBTRACT">Resta</option>
                  </select>
                  <Button
                    onClick={() =>
                      setManualConcepts((items) =>
                        items.filter((item) => item.key !== concept.key)
                      )
                    }
                    type="button"
                    variant="outline"
                  >
                    Quitar ajuste
                  </Button>
                </div>
              ))}
              {accounts.isError && (
                <p className="mt-2 text-destructive" role="alert">
                  No se pudieron cargar las cuentas. Verificá el permiso de
                  lectura contable.
                </p>
              )}
              <Button
                className="mt-3"
                disabled={manualConcepts.length >= 100 || accounts.isError}
                onClick={() =>
                  setManualConcepts((items) => [
                    ...items,
                    {
                      key: crypto.randomUUID(),
                      description: "",
                      accountId: "",
                      amount: "",
                      direction: "ADD",
                    },
                  ])
                }
                type="button"
                variant="outline"
              >
                Agregar ajuste manual
              </Button>
              <div className="mt-3 space-y-1">
                <Label htmlFor={`${paymentId}-evidence`}>
                  Evidencia o referencia
                </Label>
                <Input
                  id={`${paymentId}-evidence`}
                  maxLength={2000}
                  onChange={(event) => setEvidence(event.target.value)}
                  value={evidence}
                />
              </div>
            </fieldset>
            {error && (
              <p className="text-destructive" role="alert">
                {error}
              </p>
            )}
            {message && <output>{message}</output>}
            {locked && (
              <p>
                Conservá esta pantalla y reintentá el mismo envío para confirmar
                su resultado.
              </p>
            )}
            <Button disabled={pending} type="submit">
              {pending ? "Guardando…" : submitLabel}
            </Button>
            {!locked && (
              <Button
                className="ml-2"
                disabled={pending}
                onClick={() => router.refresh()}
                type="button"
                variant="outline"
              >
                Actualizar historial (puede descartar cambios)
              </Button>
            )}
          </form>
        )}
      </div>
    </details>
  );
}
