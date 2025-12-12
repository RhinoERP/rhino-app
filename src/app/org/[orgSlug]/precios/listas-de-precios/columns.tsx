"use client";

import { DotsThreeOutlineVerticalIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Building2, Calendar, FileText } from "lucide-react";
import Link from "next/link";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PriceList, PriceListStatus } from "@/modules/price-lists/types";

type PriceListActionsCellProps = {
  priceList: PriceList;
  orgSlug: string;
};

function getPriceListStatus(priceList: PriceList): PriceListStatus {
  const now = new Date();
  now.setHours(0, 0, 0, 0); // Reset to start of day for fair comparison

  const validFrom = new Date(priceList.valid_from);
  validFrom.setHours(0, 0, 0, 0);

  const validUntil = priceList.valid_until
    ? new Date(priceList.valid_until)
    : null;

  if (validUntil) {
    validUntil.setHours(0, 0, 0, 0);
  }

  // If valid_from is in the future (strictly after today)
  if (now < validFrom) {
    return "future";
  }

  // If valid_until exists and is in the past (strictly before today)
  if (validUntil && now > validUntil) {
    return "expired";
  }

  return "active";
}

function getStatusBadge(status: PriceListStatus) {
  switch (status) {
    case "active":
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          Activa
        </Badge>
      );
    case "future":
      return (
        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
          Futura
        </Badge>
      );
    case "expired":
      return (
        <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">
          Vencida
        </Badge>
      );
    default:
      return null;
  }
}

function PriceListActionsCell({
  priceList,
  orgSlug,
}: PriceListActionsCellProps) {
  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label="Acciones" size="icon" variant="ghost">
            <DotsThreeOutlineVerticalIcon weight="bold" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link
              href={`/org/${orgSlug}/precios/listas-de-precios/${priceList.id}`}
            >
              Ver detalle
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive focus:text-destructive">
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export const createPriceListColumns = (
  orgSlug: string
): ColumnDef<PriceList>[] => [
  {
    id: "name",
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Nombre" />
    ),
    cell: ({ row }) => {
      const priceList = row.original;
      return (
        <Link
          className="block transition-colors hover:text-blue-600"
          href={`/org/${orgSlug}/compras/listas-de-precios/${priceList.id}`}
        >
          <div className="font-medium">{priceList.name}</div>
        </Link>
      );
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
    id: "supplier",
    accessorKey: "supplier_name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Proveedor" />
    ),
    cell: ({ row }) => row.original.supplier_name ?? "—",
    meta: {
      label: "Proveedor",
      variant: "text",
      icon: Building2,
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
      const validFrom = format(new Date(priceList.valid_from), "dd/MM/yyyy", {
        locale: es,
      });
      const validUntil = priceList.valid_until
        ? format(new Date(priceList.valid_until), "dd/MM/yyyy", { locale: es })
        : "Indefinida";

      return (
        <div className="text-sm">
          {validFrom} - {validUntil}
        </div>
      );
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
    accessorFn: (row) => getPriceListStatus(row),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Estado" />
    ),
    cell: ({ row }) => {
      const status = getPriceListStatus(row.original);
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
      <PriceListActionsCell orgSlug={orgSlug} priceList={row.original} />
    ),
    enableColumnFilter: false,
    enableSorting: false,
    enableHiding: false,
  },
];
