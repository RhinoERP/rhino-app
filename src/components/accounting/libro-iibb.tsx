"use client";

import { useState } from "react";
import { BookExportButton } from "@/components/accounting/book-export-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { useLibroIIBB } from "@/modules/accounting/queries/queries.client";

function defaultDesde(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function defaultHasta(): string {
  return new Date().toISOString().slice(0, 10);
}

type Props = { orgId: string };

export function LibroIIBB({ orgId }: Props) {
  const [desde, setDesde] = useState(defaultDesde());
  const [hasta, setHasta] = useState(defaultHasta());

  const { data, isLoading, isError, error } = useLibroIIBB({
    orgId,
    desde,
    hasta,
  });

  const totals = data?.rows.reduce(
    (acc, r) => ({
      base: acc.base + Number(r.base_imponible),
      iibb: acc.iibb + Number(r.iibb),
    }),
    { base: 0, iibb: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5">
          <Label>Desde</Label>
          <Input
            className="w-36"
            onChange={(e) => setDesde(e.target.value)}
            type="date"
            value={desde}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Hasta</Label>
          <Input
            className="w-36"
            onChange={(e) => setHasta(e.target.value)}
            type="date"
            value={hasta}
          />
        </div>
        <BookExportButton
          buildHref={(format) =>
            `/api/contabilidad/libros/iibb?org_id=${orgId}&desde=${desde}&hasta=${hasta}&format=${format}`
          }
        />
      </div>

      {isLoading && (
        <p className="py-8 text-center text-muted-foreground text-sm">
          Cargando...
        </p>
      )}
      {isError && (
        <p className="py-8 text-center text-destructive text-sm">
          {error instanceof Error ? error.message : "Error al cargar IIBB"}
        </p>
      )}
      {data && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Base Imponible</TableHead>
                <TableHead className="text-right">IIBB</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.length === 0 && (
                <TableRow>
                  <TableCell
                    className="py-8 text-center text-muted-foreground text-sm"
                    colSpan={5}
                  >
                    Sin registros en el período.
                  </TableCell>
                </TableRow>
              )}
              {data.rows.map((row) => (
                <TableRow key={row.journal_entry_id}>
                  <TableCell className="text-xs">{row.fecha}</TableCell>
                  <TableCell className="text-xs">
                    {row.tipo_evento ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.descripcion ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(Number(row.base_imponible))}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(Number(row.iibb))}
                  </TableCell>
                </TableRow>
              ))}
              {totals && data.rows.length > 0 && (
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell colSpan={3}>Totales</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(totals.base)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(totals.iibb)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
