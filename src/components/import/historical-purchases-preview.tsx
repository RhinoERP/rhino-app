"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { HistoricalPurchaseRowData } from "@/modules/purchases/historical/types";

type HistoricalPurchasesPreviewProps = {
  data: HistoricalPurchaseRowData[];
};

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export function HistoricalPurchasesPreview({
  data,
}: HistoricalPurchasesPreviewProps) {
  // Show only first 5 rows
  const previewData = data.slice(0, 5);
  const hasMore = data.length > 5;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-medium text-sm">
          Vista previa ({data.length} registro{data.length !== 1 ? "s" : ""})
        </h3>
        <p className="text-muted-foreground text-xs">
          Revisa que los datos sean correctos antes de importar
        </p>
      </div>

      <div className="max-h-[300px] overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Período</TableHead>
              <TableHead className="text-right">Monto Total</TableHead>
              <TableHead className="text-right">Órdenes</TableHead>
              <TableHead>Notas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {previewData.map((row, index) => (
              <TableRow key={`${row.año}-${row.mes}-${index}`}>
                <TableCell className="font-medium">
                  {MONTH_NAMES[row.mes - 1]} {row.año}
                </TableCell>
                <TableCell className="text-right">
                  $
                  {row.monto_total.toLocaleString("es-AR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </TableCell>
                <TableCell className="text-right">
                  {row.cantidad_ordenes}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {row.notas || "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {hasMore && (
        <p className="text-center text-muted-foreground text-xs">
          ...y {data.length - 5} registro{data.length - 5 !== 1 ? "s" : ""} más
        </p>
      )}
    </div>
  );
}
