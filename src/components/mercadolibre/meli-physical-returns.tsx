"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { formatDateOnly } from "@/lib/format";
import {
  getMeliPhysicalReturnFormAction,
  getMeliPhysicalReturnHistoryAction,
} from "@/modules/mercadolibre/actions/meli-physical-return.action";
import type {
  MeliPhysicalReturnFormData,
  MeliPhysicalReturnHistory,
} from "@/modules/mercadolibre/service/meli-physical-return.service";
import { MeliPhysicalReturnForm } from "./meli-physical-return-form";

export function MeliPhysicalReturns({
  orgSlug,
  saleId,
  canCreate,
  initialHistory,
}: {
  orgSlug: string;
  saleId: string;
  canCreate: boolean;
  initialHistory: MeliPhysicalReturnHistory;
}) {
  const [history, setHistory] = useState<MeliPhysicalReturnHistory | null>(
    null
  );
  const [formData, setFormData] = useState<MeliPhysicalReturnFormData | null>(
    null
  );
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const running = useRef(false);
  const historyRequest = useRef(0);
  const displayed = history ?? initialHistory;
  function loadHistory(page: number) {
    historyRequest.current += 1;
    const version = historyRequest.current;
    startTransition(async () => {
      try {
        const result = await getMeliPhysicalReturnHistoryAction(
          orgSlug,
          saleId,
          page
        );
        if (version !== historyRequest.current) {
          return;
        }
        if (!result.success) {
          setError(result.error);
          return;
        }
        setHistory(result.data);
        setError("");
      } catch {
        if (version === historyRequest.current) {
          setError("No se pudo actualizar el historial de recepciones.");
        }
      }
    });
  }
  return (
    <section className="space-y-4 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-lg">Devoluciones físicas</h2>
        {canCreate && !formData && (
          <Button
            disabled={pending}
            onClick={() => {
              if (running.current) {
                return;
              }
              running.current = true;
              startTransition(async () => {
                try {
                  const result = await getMeliPhysicalReturnFormAction(
                    orgSlug,
                    saleId
                  );
                  if (!result.success) {
                    setError(result.error);
                    return;
                  }
                  setFormData(result.data);
                  setError("");
                } catch {
                  setError(
                    "No se pudieron cargar las salidas originales de la venta."
                  );
                } finally {
                  running.current = false;
                }
              });
            }}
            type="button"
          >
            {pending ? "Cargando…" : "Registrar devolución física"}
          </Button>
        )}
      </div>
      <p className="text-muted-foreground text-sm">
        Recepciones vinculadas a sus salidas y lotes originales. La nota de
        crédito se registra por separado.
      </p>
      {formData && (
        <MeliPhysicalReturnForm
          initialData={formData}
          onClose={() => setFormData(null)}
          onSaved={() => loadHistory(1)}
          orgSlug={orgSlug}
        />
      )}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">Recepción</th>
              <th className="p-2">Fecha</th>
              <th className="p-2">Motivo</th>
              <th className="p-2">Depósito de recepción</th>
            </tr>
          </thead>
          <tbody>
            {displayed.data.map((receipt) => (
              <tr className="border-b last:border-0" key={receipt.id}>
                <td className="p-2">
                  <Link
                    className="font-medium hover:underline"
                    href={`/org/${orgSlug}/venta-directa/mercado-libre/${saleId}/devoluciones/${receipt.id}`}
                  >
                    {receipt.id.slice(0, 8)}
                  </Link>
                </td>
                <td className="p-2">{formatDateOnly(receipt.return_date)}</td>
                <td className="p-2">{receipt.reason}</td>
                <td className="p-2">{receipt.warehouseName}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!displayed.data.length && (
          <p className="p-4 text-muted-foreground text-sm">
            No hay devoluciones físicas registradas en esta página.
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>
          {displayed.totalCount} recepciones · página {displayed.page}
        </span>
        <Button
          disabled={pending || displayed.page <= 1}
          onClick={() => loadHistory(displayed.page - 1)}
          size="sm"
          type="button"
          variant="outline"
        >
          Anterior
        </Button>
        <Button
          disabled={
            pending ||
            displayed.page * displayed.pageSize >= displayed.totalCount
          }
          onClick={() => loadHistory(displayed.page + 1)}
          size="sm"
          type="button"
          variant="outline"
        >
          Siguiente
        </Button>
      </div>
    </section>
  );
}
