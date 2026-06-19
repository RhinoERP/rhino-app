"use client";

import { ArrowDownToLine } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { useLibroDiario } from "@/modules/accounting/queries/queries.client";

const TIPOS_EVENTO = [
  { value: "FACTURA_VENTA", label: "Factura Venta" },
  { value: "FACTURA_COMPRA", label: "Factura Compra" },
  { value: "NC_VENTA", label: "NC Venta" },
  { value: "NC_COMPRA", label: "NC Compra" },
  { value: "COBRO", label: "Cobro" },
  { value: "ORDEN_PAGO", label: "Orden de Pago" },
  { value: "CONTRA_ASIENTO", label: "Contra Asiento" },
];

function defaultDesde(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function defaultHasta(): string {
  return new Date().toISOString().slice(0, 10);
}

type Props = {
  orgId: string;
  orgSlug: string;
};

type DiarioRowItem = ReturnType<typeof useLibroDiario>["data"] extends
  | { rows: (infer R)[] }
  | undefined
  ? R
  : never;

function DiarioRow({
  row,
  isNewEntry,
}: {
  row: DiarioRowItem;
  isNewEntry: boolean;
}) {
  return (
    <TableRow className={isNewEntry ? "border-t-2" : ""} key={row.linea_id}>
      <TableCell className="text-muted-foreground text-xs">
        {isNewEntry ? row.numero : ""}
      </TableCell>
      <TableCell className="text-xs">{isNewEntry ? row.fecha : ""}</TableCell>
      <TableCell className="text-sm">
        {isNewEntry ? (
          <span className="font-medium">{row.descripcion ?? "—"}</span>
        ) : null}
      </TableCell>
      <TableCell className="text-sm">
        {row.cuenta_nombre ?? (
          <span className="text-muted-foreground italic">Sin cuenta</span>
        )}
        {row.cuenta_codigo && (
          <span className="ml-1 text-muted-foreground text-xs">
            ({row.cuenta_codigo})
          </span>
        )}
      </TableCell>
      <TableCell className="text-right font-mono text-sm">
        {Number(row.debe) > 0 ? formatCurrency(Number(row.debe)) : ""}
      </TableCell>
      <TableCell className="text-right font-mono text-sm">
        {Number(row.haber) > 0 ? formatCurrency(Number(row.haber)) : ""}
      </TableCell>
      <TableCell>
        {isNewEntry && (
          <Badge
            className="text-xs"
            variant={
              row.estado_imputacion === "COMPLETO" ? "default" : "destructive"
            }
          >
            {row.estado_imputacion}
          </Badge>
        )}
      </TableCell>
    </TableRow>
  );
}

export function LibroDiario({ orgId }: Props) {
  const [desde, setDesde] = useState(defaultDesde());
  const [hasta, setHasta] = useState(defaultHasta());
  const [tipoEvento, setTipoEvento] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error } = useLibroDiario({
    orgId,
    desde,
    hasta,
    page,
    pageSize: 100,
    tipoEvento,
  });

  const xlsxUrl = `/api/contabilidad/diario?org_id=${orgId}&desde=${desde}&hasta=${hasta}&format=xlsx${tipoEvento ? `&tipo_evento=${tipoEvento}` : ""}`;

  // Group rows by journal_entry_id for visual grouping
  const groupedRows = data?.rows ?? [];
  let lastEntryId = "";

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5">
          <Label>Desde</Label>
          <Input
            className="w-36"
            onChange={(e) => {
              setDesde(e.target.value);
              setPage(1);
            }}
            type="date"
            value={desde}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Hasta</Label>
          <Input
            className="w-36"
            onChange={(e) => {
              setHasta(e.target.value);
              setPage(1);
            }}
            type="date"
            value={hasta}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Tipo de evento</Label>
          <Select
            onValueChange={(v) => {
              setTipoEvento(v === "__all__" ? undefined : v);
              setPage(1);
            }}
            value={tipoEvento ?? "__all__"}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {TIPOS_EVENTO.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <a download href={xlsxUrl}>
          <Button size="sm" variant="outline">
            <ArrowDownToLine className="mr-2 h-4 w-4" />
            Exportar XLSX
          </Button>
        </a>
      </div>

      {/* Table */}
      {isLoading && (
        <p className="py-8 text-center text-muted-foreground text-sm">
          Cargando...
        </p>
      )}
      {isError && (
        <p className="py-8 text-center text-destructive text-sm">
          {error instanceof Error ? error.message : "Error al cargar el diario"}
        </p>
      )}
      {data && (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">N°</TableHead>
                  <TableHead className="w-28">Fecha</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead className="text-right">Debe</TableHead>
                  <TableHead className="text-right">Haber</TableHead>
                  <TableHead className="w-24">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedRows.length === 0 && (
                  <TableRow>
                    <TableCell
                      className="py-8 text-center text-muted-foreground text-sm"
                      colSpan={7}
                    >
                      No hay registros para el período seleccionado.
                    </TableCell>
                  </TableRow>
                )}
                {groupedRows.map((row) => {
                  const isNewEntry = row.journal_entry_id !== lastEntryId;
                  lastEntryId = row.journal_entry_id;
                  return (
                    <DiarioRow
                      isNewEntry={isNewEntry}
                      key={row.linea_id}
                      row={row}
                    />
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {data.total} líneas totales
            </span>
            <div className="flex items-center gap-2">
              <Button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                size="sm"
                variant="outline"
              >
                Anterior
              </Button>
              <span className="text-muted-foreground">
                Página {page} de {Math.ceil(data.total / 100) || 1}
              </span>
              <Button
                disabled={page * 100 >= data.total}
                onClick={() => setPage((p) => p + 1)}
                size="sm"
                variant="outline"
              >
                Siguiente
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
