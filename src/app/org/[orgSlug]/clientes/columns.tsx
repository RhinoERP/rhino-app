"use client";

import { DotsThreeOutlineVerticalIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Building2,
  Hash,
  MapPin,
  Phone,
  SlidersHorizontalIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ArchiveCustomerDialog } from "@/components/customers/archive-customer-dialog";
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
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);

  return (
    <>
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
            <DropdownMenuItem onClick={() => setShowArchiveDialog(true)}>
              {customer.is_active ? "Archivar" : "Activar"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ArchiveCustomerDialog
        customer={customer}
        onOpenChange={setShowArchiveDialog}
        open={showArchiveDialog}
        orgSlug={orgSlug}
      />
    </>
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
    id: "client_number",
    accessorKey: "client_number",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="N° Cliente" />
    ),
    cell: ({ row }) => (
      <span className="font-mono text-sm">
        {row.original.client_number ?? "—"}
      </span>
    ),
    meta: {
      label: "N° Cliente",
      placeholder: "Buscar N° cliente...",
      variant: "text",
      icon: Hash,
    },
    enableGlobalFilter: true,
    enableColumnFilter: false,
    enableSorting: false,
    enableHiding: true,
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
    id: "city",
    accessorKey: "city",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Localidad / Ciudad" />
    ),
    cell: ({ row }) => row.original.city ?? "—",
    meta: {
      label: "Localidad / Ciudad",
      placeholder: "Buscar localidad...",
      variant: "text",
      icon: MapPin,
    },
    enableGlobalFilter: false,
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
    filterFn: (row, _id, value: string[] | string) => {
      if (!value || (Array.isArray(value) && value.length === 0)) {
        return true;
      }

      const selectedValues = Array.isArray(value) ? value : [value];
      const status = row.original.is_active ? "active" : "inactive";

      return selectedValues.includes(status);
    },
    meta: {
      label: "Estado",
      variant: "select",
      options: [
        { label: "Activo", value: "active" },
        { label: "Inactivo", value: "inactive" },
      ],
    },
    enableColumnFilter: true,
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
