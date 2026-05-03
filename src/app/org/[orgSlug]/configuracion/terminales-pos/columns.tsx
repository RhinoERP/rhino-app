"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, HashIcon, MonitorIcon } from "lucide-react";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import type { PosTerminal } from "@/modules/pos/types";

export const columns: ColumnDef<PosTerminal>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Nombre" />
    ),
    cell: ({ row }) => {
      const terminal = row.original;
      return (
        <div className="flex items-center gap-2">
          <MonitorIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{terminal.name}</span>
        </div>
      );
    },
    meta: {
      label: "Nombre",
      placeholder: "Buscar nombre...",
      variant: "text",
      icon: MonitorIcon,
    },
    enableGlobalFilter: true,
    enableColumnFilter: false,
    enableSorting: true,
    enableHiding: false,
  },
  {
    id: "cash_register_number",
    accessorKey: "cash_register_number",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="N° Caja" />
    ),
    cell: ({ row }) => {
      const cashRegisterNumber = row.original.cash_register_number;

      if (
        cashRegisterNumber === null ||
        cashRegisterNumber === undefined ||
        !Number.isFinite(cashRegisterNumber)
      ) {
        return <span className="text-muted-foreground">—</span>;
      }

      return (
        <Badge className="font-mono text-xs" variant="secondary">
          Caja {cashRegisterNumber}
        </Badge>
      );
    },
    meta: {
      label: "N° Caja",
      variant: "text",
      icon: HashIcon,
    },
    enableGlobalFilter: false,
    enableColumnFilter: false,
    enableSorting: true,
    enableHiding: false,
  },
  {
    id: "code",
    accessorKey: "code",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Código" />
    ),
    cell: ({ row }) => {
      const code = row.original.code;

      if (!code) {
        return <span className="text-muted-foreground">—</span>;
      }

      return (
        <div className="flex items-center gap-2">
          <HashIcon className="h-4 w-4 text-muted-foreground" />
          <Badge className="font-mono text-xs" variant="outline">
            {code}
          </Badge>
        </div>
      );
    },
    meta: {
      label: "Código",
      variant: "text",
      icon: HashIcon,
    },
    enableGlobalFilter: false,
    enableColumnFilter: false,
    enableSorting: true,
    enableHiding: false,
  },
  {
    id: "is_active",
    accessorKey: "is_active",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Estado" />
    ),
    cell: ({ row }) => {
      const isActive = row.original.is_active ?? false;

      return isActive ? (
        <Badge className="bg-emerald-50 text-emerald-700" variant="outline">
          Activa
        </Badge>
      ) : (
        <Badge className="bg-muted text-muted-foreground" variant="outline">
          Inactiva
        </Badge>
      );
    },
    enableGlobalFilter: false,
    enableColumnFilter: false,
    enableSorting: true,
    enableHiding: false,
  },
  {
    id: "created_at",
    accessorKey: "created_at",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Creada" />
    ),
    cell: ({ row }) => {
      const createdAt = row.original.created_at;

      if (!createdAt) {
        return <span className="text-muted-foreground">—</span>;
      }

      return (
        <span className="text-muted-foreground text-sm">
          {format(new Date(createdAt), "dd 'de' MMMM, yyyy", { locale: es })}
        </span>
      );
    },
    meta: {
      label: "Creada",
      variant: "text",
      icon: CalendarIcon,
    },
    enableGlobalFilter: false,
    enableColumnFilter: false,
    enableSorting: true,
    enableHiding: true,
  },
];
