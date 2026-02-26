"use client";

import {
  DotsThreeOutlineVerticalIcon,
  PencilIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { Calendar, DollarSign, FileText, Percent } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { CreateSalesPriceListDialog } from "@/components/sales-price-lists/create-sales-price-list-dialog";
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
import { useDeleteSalesPriceListMutation } from "@/modules/sales-price-lists/hooks/use-delete-sales-price-list-mutation";
import type {
  SalesPriceList,
  SalesPriceListStatus,
} from "@/modules/sales-price-lists/types";

type SalesPriceListActionsCellProps = {
  priceList: SalesPriceList;
  orgSlug: string;
};

function getStatusBadge(status: SalesPriceListStatus) {
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
    default:
      return null;
  }
}

function SalesPriceListActionsCell({
  priceList,
  orgSlug,
}: SalesPriceListActionsCellProps) {
  const router = useRouter();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteMutation = useDeleteSalesPriceListMutation(orgSlug);

  const handleDelete = async () => {
    setDeleteError(null);
    try {
      const result = await deleteMutation.mutateAsync(priceList.id);
      if (!result.success) {
        setDeleteError(
          result.error ?? "No se pudo eliminar la lista de precios"
        );
        return;
      }
      setIsDeleteDialogOpen(false);
      router.refresh();
    } catch (error) {
      console.error("Error deleting sales price list:", error);
      setDeleteError("No se pudo eliminar la lista de precios");
    }
  };

  return (
    <>
      <div className="flex justify-end">
        <CreateSalesPriceListDialog
          onOpenChange={setIsEditDialogOpen}
          open={isEditDialogOpen}
          orgSlug={orgSlug}
          priceList={priceList}
          trigger={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button aria-label="Acciones" size="icon" variant="ghost">
                  <DotsThreeOutlineVerticalIcon weight="bold" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setIsEditDialogOpen(true)}>
                  <PencilIcon className="mr-2 h-4 w-4" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => {
                    setDeleteError(null);
                    setIsDeleteDialogOpen(true);
                  }}
                >
                  <TrashIcon className="mr-2 h-4 w-4" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      </div>

      <Dialog onOpenChange={setIsDeleteDialogOpen} open={isDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar lista de precios</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar la lista de precios{" "}
              <strong>{priceList.name}</strong>? Esta acción no se puede
              deshacer.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm">
              {deleteError}
            </div>
          )}
          <DialogFooter>
            <Button
              disabled={deleteMutation.isPending}
              onClick={() => setIsDeleteDialogOpen(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              disabled={deleteMutation.isPending}
              onClick={handleDelete}
              type="button"
              variant="destructive"
            >
              {deleteMutation.isPending ? "Eliminando..." : "Sí, eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export const createSalesPriceListColumns = (
  orgSlug: string
): ColumnDef<SalesPriceList>[] => [
  {
    id: "name",
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Nombre" />
    ),
    cell: ({ row }) => {
      const priceList = row.original;
      return <div className="font-medium">{priceList.name}</div>;
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
    id: "value",
    accessorKey: "value",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Ajuste" />
    ),
    cell: ({ row }) => {
      const { type, value } = row.original;
      const isPrice = type === "PRICE";
      const formatted = isPrice
        ? `${value >= 0 ? "+" : "-"}$${Math.abs(value).toLocaleString("es-AR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`
        : `${value > 0 ? "+" : ""}${value}%`;
      return (
        <div className="flex items-center gap-2">
          {isPrice ? (
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Percent className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-medium">{formatted}</span>
        </div>
      );
    },
    meta: {
      label: "Ajuste",
      variant: "text",
      icon: Percent,
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
      const status = row.original.status ?? "Active";
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
      <SalesPriceListActionsCell orgSlug={orgSlug} priceList={row.original} />
    ),
    enableColumnFilter: false,
    enableSorting: false,
    enableHiding: false,
  },
];
