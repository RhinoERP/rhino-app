"use client";

import { DotsThreeOutlineVerticalIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, Calendar, FileText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateOnly } from "@/lib/format";
import type { PriceList, PriceListStatus } from "@/modules/price-lists/types";

type PriceListActionsCellProps = {
  priceList: PriceList;
  orgSlug: string;
};

function getStatusBadge(status: PriceListStatus) {
  switch (status) {
    case "Active":
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          Activa
        </Badge>
      );
    case "Scheduled":
      return (
        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
          Programada
        </Badge>
      );
    case "Archived":
      return (
        <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">
          Archivada
        </Badge>
      );
    case "Inactive":
      return (
        <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">
          Reemplazada
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
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/org/${orgSlug}/precios/listas-de-precios/${priceList.id}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(
          payload.error || "No se pudo eliminar la lista de precios"
        );
      }

      toast.success("Lista de precios eliminada correctamente");
      setShowDeleteDialog(false);
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido al eliminar la lista de precios";
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
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
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => setShowDeleteDialog(true)}
            >
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Estás seguro?</DialogTitle>
            <DialogDescription>
              Esta acción eliminará permanentemente la lista de precios "
              {priceList.name}". Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={isDeleting}
              onClick={() => setShowDeleteDialog(false)}
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              disabled={isDeleting}
              onClick={handleDelete}
              variant="destructive"
            >
              {isDeleting ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
          href={`/org/${orgSlug}/precios/listas-de-precios/${priceList.id}`}
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
      const validFrom = formatDateOnly(priceList.valid_from);

      return <div className="text-sm">Desde {validFrom}</div>;
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
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Estado" />
    ),
    cell: ({ row }) => {
      const status = row.original.status;
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
