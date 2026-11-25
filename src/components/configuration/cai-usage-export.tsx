"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getCaiUsageReportAction } from "@/modules/arca/actions/cai.actions";
import { CaiField } from "./cai-field";

export function CaiUsageExport({ orgSlug }: { orgSlug: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="space-y-3 border-t pt-5"
      onSubmit={async (event) => {
        event.preventDefault();
        const month = String(new FormData(event.currentTarget).get("month"));
        setPending(true);
        setError("");
        try {
          const result = await getCaiUsageReportAction(orgSlug, month);
          if (!result.success) {
            setError(result.error);
            return;
          }
          if (!result.data.length) {
            setError("No hay remitos con CAI en ese período.");
            return;
          }
          const lines = [
            "Fecha\tPunto de venta\tRemito\tNúmero\tCAI\tEstado",
            ...result.data.map((row) =>
              [
                row.date,
                row.pointOfSale,
                row.documentNumber,
                row.number,
                row.cai,
                row.status,
              ].join("\t")
            ),
          ];
          const url = URL.createObjectURL(
            new Blob(["\uFEFF", lines.join("\n")], {
              type: "text/tab-separated-values;charset=utf-8",
            })
          );
          const link = document.createElement("a");
          link.href = url;
          link.download = `Remitos_CAI_${month}.tsv`;
          link.click();
          URL.revokeObjectURL(url);
        } catch {
          setError("No se pudo exportar el período. Volvé a intentarlo.");
        } finally {
          setPending(false);
        }
      }}
    >
      <div>
        <h3 className="font-medium">Control mensual</h3>
        <p className="text-muted-foreground text-sm">
          Exportá los números utilizados y sus CAI para preparar la información
          del período. La exportación no presenta el informe en ARCA.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <CaiField
          disabled={pending}
          label="Período"
          name="month"
          required
          type="month"
        />
        <Button disabled={pending} type="submit" variant="outline">
          {pending ? "Exportando…" : "Exportar remitos"}
        </Button>
      </div>
      {error && (
        <p className="text-sm" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
