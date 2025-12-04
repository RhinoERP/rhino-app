"use client";

import { DotsThreeOutlineVertical } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Supplier } from "@/modules/proveedores/service/suppliers.service";

export const createSupplierColumns = (
  orgSlug: string
): ColumnDef<Supplier>[] => [
  {
    accessorKey: "name",
    header: "Proveedor",
    cell: ({ row }) => row.original.name,
  },
  {
    accessorKey: "cuit",
    header: "CUIT",
    cell: ({ row }) => row.original.cuit ?? "—",
  },
  {
    accessorKey: "phone",
    header: "Teléfono",
    cell: ({ row }) => row.original.phone ?? "—",
  },
  {
    accessorKey: "contact_name",
    header: "Contacto",
    cell: ({ row }) => row.original.contact_name ?? "—",
  },
  {
    id: "actions",
    header: "",
    enableHiding: false,
    cell: ({ row }) => {
      const router = useRouter();
      const [isPending, startTransition] = useTransition();
      const supplier = row.original;

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
                <DotsThreeOutlineVertical weight="bold" />
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
    },
  },
];
