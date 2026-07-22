"use client";

import {
  DotsThreeOutlineVerticalIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, Hash, Phone, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSupplierMutations } from "@/modules/suppliers/hooks/use-suppliers-mutations";
import type { Supplier } from "@/modules/suppliers/service/suppliers.service";

type SupplierActionsCellProps = {
  supplier: Supplier;
  orgSlug: string;
};

function SupplierActionsCell({ supplier, orgSlug }: SupplierActionsCellProps) {
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { deleteSupplier } = useSupplierMutations(orgSlug);

  const handleDelete = () => {
    deleteSupplier.mutate(supplier.id, {
      onSuccess: () => {
        toast.success("Proveedor eliminado correctamente");
        setShowDeleteDialog(false);
        router.refresh();
      },
      onError: (error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "No se pudo eliminar el proveedor"
        );
      },
    });
  };

  return (
    <>
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Acciones"
              disabled={deleteSupplier.isPending}
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
              disabled={deleteSupplier.isPending}
              onClick={() => setShowDeleteDialog(true)}
            >
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar proveedor?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente el
              proveedor <strong>{supplier.name}</strong> del sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={handleDelete}
          >
            Eliminar
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
