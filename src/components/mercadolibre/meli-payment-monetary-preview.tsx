"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useCuentas } from "@/modules/accounting/queries/queries.client";
import { getMeliFiscalAccountingSnapshotAction } from "@/modules/mercadolibre/actions/meli-fiscal-accounting-history.action";
import type { MeliAccountingBreakdown } from "@/modules/mercadolibre/utils/accounting-breakdown";
import { buildMeliPaymentPreview } from "@/modules/mercadolibre/utils/accounting-payment-preview";

type Proposal = ReturnType<typeof buildMeliPaymentPreview>;

export function MeliPaymentMonetaryPreview({
  orgSlug,
  orgId,
  saleId,
  grossAmount,
  currency,
  breakdown,
  enabled,
}: {
  orgSlug: string;
  orgId: string;
  saleId: string;
  grossAmount: string;
  currency: "ARS" | "USD";
  breakdown: MeliAccountingBreakdown;
  enabled: boolean;
}) {
  const accounts = useCuentas(orgId, { enabled });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [rate, setRate] = useState<number | null>(null);

  function preview() {
    setError("");
    setProposal(null);
    if (accounts.isError || !accounts.data) {
      setError("No se pudieron consultar las cuentas de la organización.");
      return;
    }
    const currentAccounts = accounts.data;
    startTransition(async () => {
      try {
        const result = await getMeliFiscalAccountingSnapshotAction(orgSlug, {
          type: "invoice",
          saleId,
        });
        if (!result.success) {
          setError(result.error);
          return;
        }
        const lines = buildMeliPaymentPreview(
          { grossAmount, currency },
          breakdown,
          result.data,
          currentAccounts
        );
        setRate(result.data.exchangeRate);
        setProposal(lines);
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "No se pudo preparar la vista monetaria."
        );
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button
        disabled={pending || accounts.isLoading}
        onClick={preview}
        type="button"
        variant="outline"
      >
        {pending ? "Consultando…" : "Revisar propuesta monetaria"}
      </Button>
      {error && (
        <p className="text-destructive" role="alert">
          No se pudo preparar la propuesta: {error}
        </p>
      )}
      {proposal && (
        <>
          <p>
            Vista preliminar sin asiento. Las cuentas, el antecedente y la
            conciliación deben verificarse antes de publicar. Cotización fiscal
            de la factura: {rate ?? "no disponible"}.
          </p>
          <ul className="space-y-2">
            {proposal.map((component) => (
              <li key={component.key}>
                <p>{component.description}</p>
                {component.lines.map((line) => (
                  <p className="break-all" key={line.side}>
                    {line.side}: cuenta {line.accountId} · {line.originalAmount}{" "}
                    {currency} · {line.pesosAmount} ARS
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
