"use client";

import {
  DotsThreeOutlineVerticalIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, Hash, Phone, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Supplier } from "@/modules/suppliers/service/suppliers.service";

type SupplierActionsCellProps = {
  supplier: Supplier;
  orgSlug: string;
};

function SupplierActionsCell({ supplier, orgSlug }: SupplierActionsCellProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/org/${orgSlug}/proveedores/${supplier.id}`,
          {
            method: "DELETE",
          }
        );

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "No se pudo eliminar");
        }

        router.refresh();
      } catch (error) {
        console.error("Error al eliminar proveedor:", error);
      }
    });
  };

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Acciones"
            disabled={isPending}
            size="icon"
            variant="ghost"
          >
            <DotsThreeOutlineVerticalIcon weight="bold" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() =>
              router.push(`/org/${orgSlug}/proveedores/${supplier.id}`)
            }
          >
            Ver detalle
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            disabled={isPending}
            onClick={handleDelete}
          >
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export const createSupplierColumns = (
  orgSlug: string
): ColumnDef<Supplier>[] => [
  {
    id: "name",
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Proveedor" />
    ),
    cell: ({ row }) => {
      const supplier = row.original;
      return (
        <Link
          className="block transition-colors hover:text-blue-600"
          href={`/org/${orgSlug}/proveedores/${supplier.id}`}
        >
          <div className="font-medium">{supplier.name}</div>
        </Link>
      );
    },
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
    enableColumnFilter: false,
    enableSorting: false,
    enableHiding: false,
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
    id: "contact_name",
    accessorKey: "contact_name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Contacto" />
    ),
    cell: ({ row }) => row.original.contact_name ?? "—",
    meta: {
      label: "Contacto",
      placeholder: "Buscar contacto...",
      variant: "text",
      icon: User,
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
      <SupplierActionsCell orgSlug={orgSlug} supplier={row.original} />
    ),
  },
];
