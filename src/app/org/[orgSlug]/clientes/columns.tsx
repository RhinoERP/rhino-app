"use client";

import { DotsThreeOutlineVertical, Eye } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Customer } from "@/modules/customers/types";

export const createColumns = (orgSlug: string): ColumnDef<Customer>[] => [
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
              <DropdownMenuItem>
                <Link
                  className="flex w-full items-center gap-2"
                  href={`/org/${orgSlug}/clientes/${customer.id}`}
                >
                  <Eye className="h-4 w-4" />
                  Ver detalles
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem>Archivar</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
  },
];
