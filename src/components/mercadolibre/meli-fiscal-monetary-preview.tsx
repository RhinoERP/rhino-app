"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useCuentas } from "@/modules/accounting/queries/queries.client";
import {
  publishMeliFiscalAction,
  retryMeliFiscalAutomaticAction,
  saveMeliFiscalAutomaticConfigurationAction,
} from "@/modules/mercadolibre/actions/meli-fiscal-preparation.action";
import {
  availableMeliFiscalAccounts,
  buildMeliFiscalPreview,
  meliFiscalAccountFields,
  suggestMeliFiscalAccountAssignments,
} from "@/modules/mercadolibre/utils/accounting-fiscal-preview";
import type { readMeliAccountingFiscalSnapshot } from "@/modules/mercadolibre/utils/accounting-fiscal-snapshot";

type Snapshot = ReturnType<typeof readMeliAccountingFiscalSnapshot>;
type Proposal = ReturnType<typeof buildMeliFiscalPreview>;
type Origin =
  | { type: "invoice"; saleId: string }
  | { type: "creditNote"; saleId: string; creditNoteId: string };

export function MeliFiscalMonetaryPreview({
  orgSlug,
  orgId,
  origin,
  snapshot,
}: {
  orgSlug: string;
  orgId: string;
  origin: Origin;
  snapshot: Snapshot;
}) {
  const router = useRouter();
  const accounts = useCuentas(orgId);
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState("");
  const [publication, setPublication] = useState("");
  const available = availableMeliFiscalAccounts(
    accounts.data ?? [],
    snapshot.currency
  );
  const fields = meliFiscalAccountFields(snapshot);
  const selectedAccounts = {
    ...suggestMeliFiscalAccountAssignments(snapshot, accounts.data ?? []),
    ...assignments,
  };
  const proposalAvailable =
    !accounts.isError &&
    proposal?.every((line) =>
      available.some((account) => account.id === line.accountId)
    );

  function preview() {
    setProposal(null);
    setError("");
    setPublication("");
    if (accounts.isError || !accounts.data) {
      setError("No se pudieron consultar las cuentas de la organización.");
      return;
    }
    try {
      setProposal(
        buildMeliFiscalPreview(
          origin.type,
          snapshot,
          accounts.data,
          selectedAccounts
        )
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo revisar el comprobante."
      );
    }
  }

  function publish() {
    if (pending || !proposalAvailable || !proposal) {
      return;
    }
    setError("");
    setPublication("");
    startTransition(async () => {
      const result = await publishMeliFiscalAction(
        orgSlug,
        origin,
        selectedAccounts
      );
      if (!result.success) {
        setError(result.error);
        return;
      }
      setPublication(
        `Asiento publicado y verificado: ${result.data.journalEntryId}`
      );
      router.refresh();
    });
  }

  function saveAutomaticConfiguration() {
    if (pending || !proposalAvailable || !proposal) {
      return;
    }
    setError("");
    setPublication("");
    startTransition(async () => {
      const result = await saveMeliFiscalAutomaticConfigurationAction(
        orgSlug,
        origin,
        selectedAccounts
      );
      if (!result.success) {
        setError(result.error);
        return;
      }
      setPublication(
        `Cuentas revisadas guardadas para publicación automática en ${result.data.currency}. Los conceptos no configurados quedarán pendientes.`
      );
    });
  }

  function retryAutomatic() {
    if (pending) {
      return;
    }
    setError("");
    setPublication("");
    startTransition(async () => {
      const result = await retryMeliFiscalAutomaticAction(orgSlug, origin);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setPublication(
        `Asiento publicado y verificado: ${result.data.journalEntryId}`
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 border-t pt-2">
      <p>
        Revisá las cuentas sugeridas para cada concepto; son provisionales y
        pueden cambiarse. La vista previa no publica asientos; publicá solo
        después de revisar las cuentas.
      </p>
      <p>
        Un administrador puede guardar las cuentas revisadas para comprobantes
        posteriores de esta moneda. Los impuestos no configurados y los
        comprobantes emitidos por usuarios sin permiso contable quedan
        pendientes de revisión.
      </p>
      {accounts.isLoading && <p>Consultando cuentas…</p>}
      {accounts.isError && (
        <p className="text-destructive" role="alert">
          No se pudieron consultar las cuentas de la organización. Verificá el
          permiso de lectura contable y reintentá.
        </p>
      )}
      {fields.map((field) => (
        <div className="space-y-1" key={field.key}>
          <label className="block" htmlFor={`${id}-${field.key}`}>
            {field.label}
          </label>
          <select
            className="w-full rounded-md border bg-background p-2"
            disabled={accounts.isLoading || accounts.isError}
            id={`${id}-${field.key}`}
            onChange={(event) => {
              setAssignments((current) => ({
                ...current,
                [field.key]: event.target.value,
              }));
              setProposal(null);
              setError("");
            }}
            value={selectedAccounts[field.key] ?? ""}
          >
            <option value="">Seleccionar cuenta</option>
            {available.map((account) => (
              <option key={account.id} value={account.id}>
                {account.codigo} · {account.nombre}
              </option>
            ))}
          </select>
        </div>
      ))}
      <Button
        disabled={accounts.isLoading || accounts.isError || pending}
        onClick={preview}
        type="button"
        variant="outline"
      >
        Revisar propuesta contable
      </Button>
      {error && (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      )}
      {proposal && !proposalAvailable && !accounts.isError && (
        <p className="text-destructive" role="alert">
          Cambió la disponibilidad de las cuentas. Revisá las asignaciones.
        </p>
      )}
      {proposal && proposalAvailable && (
        <div>
          <p>
            Vista preliminar: verificá las cuentas, el período y la conciliación
            antes de contabilizar.
          </p>
          {proposal.map((line) => (
            <p className="break-all" key={line.key}>
              {line.side}:{" "}
              {
                available.find((account) => account.id === line.accountId)
                  ?.nombre
              }
              {" · "}
              {line.originalAmount} {snapshot.currency} · {line.pesosAmount} ARS
            </p>
          ))}
          <Button disabled={pending} onClick={publish} type="button">
            {pending ? "Publicando y verificando…" : "Publicar asiento fiscal"}
          </Button>
          <Button
            disabled={pending}
            onClick={saveAutomaticConfiguration}
            type="button"
            variant="outline"
          >
            Guardar estas cuentas para emisión automática
          </Button>
        </div>
      )}
      <Button
        disabled={pending}
        onClick={retryAutomatic}
        type="button"
        variant="outline"
      >
        Reintentar contabilización automática
      </Button>
      {publication && <output>{publication}</output>}
    </div>
  );
}
