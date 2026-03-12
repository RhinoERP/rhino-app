"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Building2, Hash, MapPin, Phone } from "lucide-react";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { AssignCustomerButton } from "@/components/sales-price-lists/assign-customer-button";
import { Badge } from "@/components/ui/badge";
import type { Customer } from "@/modules/customers/types";

type AssignColumnsMeta = {
  orgSlug: string;
  listId: string;
  assignedIds: Set<string>;
  isPendingId: string | null;
  onAssign: (customerId: string) => void;
};

export function createAssignColumns({
  assignedIds,
  isPendingId,
  onAssign,
}: AssignColumnsMeta): ColumnDef<Customer>[] {
  return [
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
        variant: "text",
        icon: Hash,
      },
      enableGlobalFilter: true,
      enableColumnFilter: false,
      enableSorting: false,
      enableHiding: true,
    },
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
          <div className="space-y-1">
            <div className="font-medium">{displayName}</div>
            {secondaryName && (
              <div className="text-muted-foreground text-sm">
                {secondaryName}
              </div>
            )}
          </div>
        );
      },
      meta: {
        label: "Nombre",
        variant: "text",
        icon: Building2,
      },
      enableGlobalFilter: true,
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: false,
    },
    {
      id: "city",
      accessorKey: "city",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Localidad" />
      ),
      cell: ({ row }) => row.original.city ?? "—",
      meta: {
        label: "Localidad",
        variant: "text",
        icon: MapPin,
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
      id: "assign",
      header: () => <span className="sr-only">Asignar</span>,
      enableHiding: false,
      enableColumnFilter: false,
      enableSorting: false,
      cell: ({ row }) => {
        const customerId = row.original.id;
        return (
          <div className="flex justify-end">
            <AssignCustomerButton
              assigned={assignedIds.has(customerId)}
              customerId={customerId}
              listId=""
              loading={isPendingId === customerId}
              onAssign={() => onAssign(customerId)}
            />
          </div>
        );
      },
    },
  ];
}
