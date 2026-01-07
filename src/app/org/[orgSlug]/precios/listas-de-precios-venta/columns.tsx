"use client";

import { DotsThreeOutlineVerticalIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { Calendar, FileText, Percent } from "lucide-react";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateOnly } from "@/lib/format";
import type {
  SalesPriceList,
  SalesPriceListStatus,
} from "@/modules/sales-price-lists/types";

type SalesPriceListActionsCellProps = {
  priceList: SalesPriceList;
  orgSlug: string;
};

function getStatusBadge(status: SalesPriceListStatus) {
  switch (status) {
    case "Active":
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          Activa
        </Badge>
      );
    case "Scheduled":
      return (
        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
          Programada
        </Badge>
      );
    case "Archived":
      return (
        <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">
          Archivada
        </Badge>
      );
    default:
      return null;
  }
}

function SalesPriceListActionsCell({
  priceList: _priceList,
  orgSlug: _orgSlug,
}: SalesPriceListActionsCellProps) {
  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label="Acciones" size="icon" variant="ghost">
            <DotsThreeOutlineVerticalIcon weight="bold" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className="text-destructive focus:text-destructive">
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export const createSalesPriceListColumns = (
  orgSlug: string
): ColumnDef<SalesPriceList>[] => [
  {
    id: "name",
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Nombre" />
    ),
    cell: ({ row }) => {
      const priceList = row.original;
      return <div className="font-medium">{priceList.name}</div>;
    },
    meta: {
      label: "Nombre",
      variant: "text",
      icon: FileText,
    },
    enableColumnFilter: false,
    enableSorting: true,
    enableHiding: false,
  },
  {
    id: "percentage",
    accessorKey: "percentage",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Porcentaje" />
    ),
    cell: ({ row }) => {
      const percentage = row.original.percentage;
      const formatted = percentage > 0 ? `+${percentage}%` : `${percentage}%`;
      return (
        <div className="flex items-center gap-2">
          <Percent className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{formatted}</span>
        </div>
      );
    },
    meta: {
      label: "Porcentaje",
      variant: "text",
      icon: Percent,
    },
    enableColumnFilter: false,
    enableSorting: true,
    enableHiding: false,
  },
  {
    id: "valid_from",
    accessorKey: "valid_from",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Vigencia" />
    ),
    cell: ({ row }) => {
      const priceList = row.original;
      const validFrom = formatDateOnly(priceList.valid_from);

      return <div className="text-sm">Desde {validFrom}</div>;
    },
    meta: {
      label: "Vigencia",
      variant: "text",
      icon: Calendar,
    },
    enableColumnFilter: false,
    enableSorting: true,
    enableHiding: true,
  },
  {
    id: "status",
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Estado" />
    ),
    cell: ({ row }) => {
      const status = row.original.status ?? "Active";
      return getStatusBadge(status);
    },
    meta: {
      label: "Estado",
      variant: "text",
    },
    enableColumnFilter: false,
    enableSorting: false,
    enableHiding: true,
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <SalesPriceListActionsCell orgSlug={orgSlug} priceList={row.original} />
    ),
    enableColumnFilter: false,
    enableSorting: false,
    enableHiding: false,
  },
];
