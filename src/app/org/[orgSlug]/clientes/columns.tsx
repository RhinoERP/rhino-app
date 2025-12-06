"use client";

import { DotsThreeOutlineVerticalIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, Hash, Phone, SlidersHorizontalIcon } from "lucide-react";
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
import type { Customer } from "@/modules/customers/types";

type CustomerActionsCellProps = {
  customer: Customer;
  orgSlug: string;
};

function CustomerActionsCell({ customer, orgSlug }: CustomerActionsCellProps) {
  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-8 w-8 p-0" variant="ghost">
            <span className="sr-only">Abrir menú</span>
            <DotsThreeOutlineVerticalIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>
            <Link
              className="flex w-full items-center"
              href={`/org/${orgSlug}/clientes/${customer.id}`}
            >
              Ver detalles
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem>Archivar</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export const createColumns = (orgSlug: string): ColumnDef<Customer>[] => [
  {
    id: "name",
    accessorKey: "fantasy_name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Nombre" />
    ),
    cell: ({ row }) => {
      const customer = row.original;
      const displayName = customer.fantasy_name || customer.business_name;
      const secondaryName = customer.fantasy_name
        ? customer.business_name
        : null;

      return (
        <Link
          className="block space-y-1 transition-colors hover:text-blue-600"
          href={`/org/${orgSlug}/clientes/${customer.id}`}
        >
          <div className="font-medium">{displayName}</div>
          {secondaryName && (
            <div className="text-muted-foreground text-sm">{secondaryName}</div>
          )}
        </Link>
      );
    },
    meta: {
      label: "Nombre",
      placeholder: "Buscar nombre...",
      variant: "text",
      icon: Building2,
    },
    enableGlobalFilter: true,
    enableColumnFilter: false,
    enableSorting: true,
    enableHiding: false,
  },
  {
    id: "cuit",
    accessorKey: "cuit",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="CUIT" />
    ),
    cell: ({ row }) => row.original.cuit ?? "—",
    meta: {
      label: "CUIT",
      variant: "text",
      icon: Hash,
    },
    enableGlobalFilter: true,
    enableColumnFilter: false,
    enableSorting: false,
    enableHiding: true,
  },
  {
    id: "phone",
    accessorKey: "phone",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Teléfono" />
    ),
    cell: ({ row }) => row.original.phone ?? "—",
    meta: {
      label: "Teléfono",
      placeholder: "Buscar teléfono...",
      variant: "text",
      icon: Phone,
    },
    enableColumnFilter: false,
    enableSorting: false,
    enableHiding: true,
  },
  {
    id: "is_active",
    accessorKey: "is_active",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Estado" />
    ),
    cell: ({ row }) => {
      const isActive = row.original.is_active;

      return (
        <Badge variant={isActive ? "default" : "secondary"}>
          {isActive ? "Activo" : "Inactivo"}
        </Badge>
      );
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
    header: () => <SlidersHorizontalIcon className="mr-2 ml-auto size-4" />,
    id: "actions",
    enableHiding: false,
    enableColumnFilter: false,
    enableSorting: false,
    size: 10,
    enableResizing: true,
    cell: ({ row }) => (
      <CustomerActionsCell customer={row.original} orgSlug={orgSlug} />
    ),
  },
];
