"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import type {
  TreasuryMovement,
  TreasuryMovementTipo,
} from "@/lib/accounting-client";
import { formatCurrency } from "@/lib/format";

const TIPO_LABELS: Record<TreasuryMovementTipo, string> = {
  DEBITO_BANCARIO: "Débito bancario",
  CREDITO_BANCARIO: "Crédito bancario",
  CHEQUE_RECIBIDO_RECHAZADO: "Cheque recibido rechazado",
  CHEQUE_PROPIO_RECHAZADO: "Cheque propio rechazado",
  DEPOSITO_CHEQUES: "Depósito de cheques",
  DEPOSITO_EFECTIVO: "Depósito de efectivo",
  DEBITO_CHEQUE_PROPIO: "Débito cheque propio",
};

export const bankMovementColumns: ColumnDef<TreasuryMovement>[] = [
  {
    accessorKey: "fecha",
    header: "Fecha",
    cell: ({ row }) => {
      const fecha = row.getValue<string>("fecha");
      return <span className="tabular-nums">{fecha?.slice(0, 10)}</span>;
    },
  },
  {
    accessorKey: "tipo",
    header: "Tipo",
    cell: ({ row }) => {
      const tipo = row.getValue<TreasuryMovementTipo>("tipo");
      return (
        <span className="text-muted-foreground text-xs">
          {TIPO_LABELS[tipo] ?? tipo}
        </span>
      );
    },
  },
  {
    accessorKey: "descripcion",
    header: "Descripción",
    cell: ({ row }) => (
      <span className="max-w-xs truncate">
        {row.getValue<string>("descripcion")}
      </span>
    ),
  },
  {
    id: "movimiento",
    header: "Movimiento",
    cell: ({ row }) => {
      const lado = row.original.lado;
      const importe = row.original.importe;
      const isHaber = lado === "HABER";
      return (
        <span
          className={
            isHaber ? "font-medium text-green-600" : "font-medium text-red-600"
          }
        >
          {isHaber ? "+" : "-"}
          {formatCurrency(Number(importe))}
        </span>
      );
    },
  },
  {
    accessorKey: "estado",
    header: "Estado",
    cell: ({ row }) => {
      const estado = row.getValue<string>("estado");
      return (
        <Badge
          className={
            estado === "ANULADO"
              ? "bg-gray-100 text-gray-700"
              : "bg-green-100 text-green-700"
          }
          variant="outline"
        >
          {estado === "ANULADO" ? "Anulado" : "Activo"}
        </Badge>
      );
    },
  },
];
