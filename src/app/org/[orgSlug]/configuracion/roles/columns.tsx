"use client";

import {
  ArrowsDownUpIcon,
  DotsThreeOutlineVerticalIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { OrganizationRole } from "@/modules/organizations/service/roles.service";

export const columns: ColumnDef<OrganizationRole>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <Button
        className="px-0 text-left"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        type="button"
        variant="ghost"
      >
        Nombre
        <ArrowsDownUpIcon className="ml-2 size-4" weight="bold" />
      </Button>
    ),
  },
  {
    accessorKey: "key",
    header: "Clave",
    cell: ({ row }) => {
      const key = row.original.key;

      return (
        <Badge className="font-mono text-xs uppercase" variant="outline">
          {key}
        </Badge>
      );
    },
  },
  {
    accessorKey: "description",
    header: "Descripción",
    cell: ({ row }) => {
      const description = row.original.description;

      return description || "Sin descripción";
    },
  },
  {
    accessorKey: "memberCount",
    header: "Miembros",
    cell: ({ row }) => {
      const count = row.original.memberCount;

      return (
        <span className="text-muted-foreground text-sm">
          {count} {count === 1 ? "miembro" : "miembros"}
        </span>
      );
    },
  },
  {
    id: "actions",
    header: "",
    enableHiding: false,
    cell: ({ row }) => {
      const role = row.original;
      const isAdmin = role.key === "admin";

      return (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button aria-label="Acciones" size="icon" variant="ghost">
                <DotsThreeOutlineVerticalIcon weight="bold" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={isAdmin}
                onClick={() => console.log("Editar rol", role.id)}
              >
                <PencilIcon className="mr-2 size-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => console.log("Ver permisos", role.id)}
              >
                <EyeIcon className="mr-2 size-4" />
                Ver permisos
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                disabled={isAdmin}
                onClick={() => console.log("Eliminar rol", role.id)}
              >
                <TrashIcon className="mr-2 size-4" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
  },
];
