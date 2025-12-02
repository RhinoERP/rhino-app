"use client";

import { DotsThreeOutlineVertical } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Customer } from "@/modules/customers/types";

export const createColumns = (
  onViewDetails: (customer: Customer) => void
): ColumnDef<Customer>[] => [
  {
    accessorKey: "fantasy_name",
    header: "Nombre",
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
            <div className="text-muted-foreground text-sm">{secondaryName}</div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "cuit",
    header: "Documento",
    cell: ({ row }) => row.original.cuit ?? "—",
  },
  {
    accessorKey: "phone",
    header: "Teléfono",
    cell: ({ row }) => row.original.phone ?? "—",
  },
  {
    accessorKey: "is_active",
    header: "Estado",
    cell: ({ row }) => {
      const isActive = row.original.is_active;

      return (
        <Badge variant={isActive ? "default" : "secondary"}>
          {isActive ? "Activo" : "Inactivo"}
        </Badge>
      );
    },
  },
  {
    id: "actions",
    header: "",
    enableHiding: false,
    cell: ({ row }) => {
      const customer = row.original;

      return (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-8 w-8 p-0" variant="ghost">
                <span className="sr-only">Abrir menú</span>
                <DotsThreeOutlineVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onViewDetails(customer)}>
                Ver detalles
              </DropdownMenuItem>
              <DropdownMenuItem>Archivar</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
  },
];
