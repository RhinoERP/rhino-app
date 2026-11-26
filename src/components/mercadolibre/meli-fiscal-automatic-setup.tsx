"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useCuentas } from "@/modules/accounting/queries/queries.client";
import { saveMeliFiscalInitialConfigurationAction } from "@/modules/mercadolibre/actions/meli-fiscal-preparation.action";
import { availableMeliFiscalAccounts } from "@/modules/mercadolibre/utils/accounting-fiscal-preview";

export function MeliFiscalAutomaticSetup({
  orgId,
  orgSlug,
}: {
  orgId: string;
  orgSlug: string;
}) {
  const [open, setOpen] = useState(false);
  const accounts = useCuentas(orgId, { enabled: open });
  const [currency, setCurrency] = useState<"ARS" | "USD">("ARS");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const available = availableMeliFiscalAccounts(accounts.data ?? [], currency);
  const fields = [
    { key: "receivable", code: "AR_DEUDORES_VENTAS", label: "Deudores" },
    { key: "revenue", code: "VENTAS_MERCADO_LIBRE", label: "Ventas" },
    { key: "vat", code: "IVA_DEBITO_FISCAL", label: "IVA débito fiscal" },
  ] as const;
  const resolved = fields.map((field) => ({
    ...field,
    matches: available.filter((account) => account.account_code === field.code),
  }));
  const [receivable, revenue, vat] = resolved.map((field) =>
    field.matches.length === 1 ? field.matches[0] : null
  );

  function save() {
    if (!(confirmed && receivable && revenue && vat) || pending) {
      return;
    }
    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await saveMeliFiscalInitialConfigurationAction(orgSlug, {
        currency,
        receivable: receivable.id,
        revenue: revenue.id,
        vat: vat.id,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setConfirmed(false);
      setMessage(`Configuración ${result.data.currency} guardada y auditada.`);
    });
  }

  return (
    <details
      className="space-y-2 rounded-md border p-4 text-sm"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer font-medium">
        Configurar cuentas fiscales automáticas
      </summary>
      <p>
        Revisá esta propuesta con el contador. Ventas se aplicará a neto, exento
        y no gravado; IVA débito fiscal se aplicará a los códigos ARCA 3, 4, 5,
        6, 8 y 9. Esta propuesta no configura otros tributos. Guardar reemplaza
        estas asignaciones para la moneda elegida y afecta futuras emisiones.
      </p>
      <label className="block">
        Moneda
        <select
          className="ml-2 rounded-md border bg-background p-1"
          disabled={pending}
          onChange={(event) => {
            setCurrency(event.target.value === "USD" ? "USD" : "ARS");
            setConfirmed(false);
            setMessage("");
            setError("");
          }}
          value={currency}
        >
          <option value="ARS">ARS</option>
          <option value="USD">USD</option>
        </select>
      </label>
      {accounts.isLoading && <p>Cargando cuentas contables…</p>}
      {!(accounts.isLoading || accounts.isError) &&
        resolved.map((field) => (
          <p key={field.key}>
            {field.label} ({field.code}):{" "}
            {field.matches.length === 1
              ? `${field.matches[0].codigo} · ${field.matches[0].nombre}`
              : "No hay una cuenta única y habilitada para esta moneda."}
          </p>
        ))}
      {accounts.isError && (
        <p className="text-destructive" role="alert">
          No se pudieron consultar las cuentas contables.
        </p>
      )}
      <label className="flex items-center gap-2">
        <input
          checked={confirmed}
          disabled={pending}
          onChange={(event) => setConfirmed(event.target.checked)}
          type="checkbox"
        />
        Revisé y acepto estas cuentas para esta moneda.
      </label>
      <Button
        disabled={
          pending ||
          accounts.isLoading ||
          accounts.isError ||
          !(confirmed && receivable && revenue && vat)
        }
        onClick={save}
        type="button"
        variant="outline"
      >
        {pending ? "Guardando…" : "Guardar propuesta fiscal"}
      </Button>
      {message && <p>{message}</p>}
      {error && (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}
