"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useState } from "react";
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
import type { TreasuryMovementTipo } from "@/lib/accounting-client";
import { useMovimientos } from "@/modules/treasury/queries/queries.client";
import { bankMovementColumns } from "./bank-movement-columns";

type Props = {
  orgId: string;
  cuentaId?: string;
};

const TIPOS: { value: TreasuryMovementTipo | "all"; label: string }[] = [
  { value: "all", label: "Todos los tipos" },
  { value: "DEBITO_BANCARIO", label: "Débito bancario" },
  { value: "CREDITO_BANCARIO", label: "Crédito bancario" },
  { value: "CHEQUE_RECIBIDO_RECHAZADO", label: "Cheque recibido rechazado" },
  { value: "CHEQUE_PROPIO_RECHAZADO", label: "Cheque propio rechazado" },
  { value: "DEPOSITO_CHEQUES", label: "Depósito de cheques" },
  { value: "DEPOSITO_EFECTIVO", label: "Depósito de efectivo" },
  { value: "DEBITO_CHEQUE_PROPIO", label: "Débito cheque propio" },
];

export function BankMovementsTable({ orgId, cuentaId }: Props) {
  const thisYear = new Date().getFullYear();
  const [desde, setDesde] = useState(`${thisYear}-01-01`);
  const [hasta, setHasta] = useState(`${thisYear}-12-31`);
  const [tipo, setTipo] = useState<TreasuryMovementTipo | "all">("all");

  const { data: movimientos = [], isLoading } = useMovimientos({
    orgId,
    cuentaId,
    desde,
    hasta,
    tipo: tipo === "all" ? undefined : tipo,
  });

  const table = useReactTable({
    data: movimientos,
    columns: bankMovementColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm" htmlFor="mov-desde">
            Desde
          </label>
          <input
            className="h-8 rounded-md border px-2 text-sm"
            id="mov-desde"
            onChange={(e) => setDesde(e.target.value)}
            type="date"
            value={desde}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm" htmlFor="mov-hasta">
            Hasta
          </label>
          <input
            className="h-8 rounded-md border px-2 text-sm"
            id="mov-hasta"
            onChange={(e) => setHasta(e.target.value)}
            type="date"
            value={hasta}
          />
        </div>
        <Select
          onValueChange={(v) => setTipo(v as TreasuryMovementTipo | "all")}
          value={tipo}
        >
          <SelectTrigger className="h-8 w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIPOS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell
                  className="py-8 text-center text-muted-foreground"
                  colSpan={5}
                >
                  Cargando...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && table.getRowModel().rows.length === 0 && (
              <TableRow>
                <TableCell
                  className="py-8 text-center text-muted-foreground"
                  colSpan={5}
                >
                  Sin movimientos en el período seleccionado.
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
