"use client";

import { DotsThreeOutlineVerticalIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, PercentIcon, TagIcon } from "lucide-react";
import { useState } from "react";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { AddTaxDialog } from "@/components/taxes/add-tax-dialog";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTaxMutations } from "@/modules/taxes/hooks/use-taxes-mutations";
import type { Tax } from "@/modules/taxes/service/taxes.service";

type TaxActionsCellProps = {
  tax: Tax;
  orgSlug: string;
};

function TaxActionsCell({ tax, orgSlug }: TaxActionsCellProps) {
  const { deleteTax } = useTaxMutations(orgSlug);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteTax.mutateAsync(tax.id);
      setShowDeleteDialog(false);
    } catch (error) {
      console.error("Error deleting tax:", error);
    } finally {
      setIsDeleting(false);
    }
  };

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
            <DropdownMenuItem onSelect={() => setShowEditDialog(true)}>
              Editar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onSelect={() => setShowDeleteDialog(true)}
            >
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {showEditDialog && (
        <AddTaxDialog
          onOpenChange={setShowEditDialog}
          onUpdated={() => setShowEditDialog(false)}
          open={showEditDialog}
          orgSlug={orgSlug}
          tax={tax}
        />
      )}

      <Dialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Estás seguro?</DialogTitle>
            <DialogDescription>
              Esta acción desactivará el impuesto "{tax.name}" y dejará de estar
              disponible para nuevas ventas o compras. Los documentos ya creados
              no se verán afectados.
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

export const createColumns = (orgSlug: string): ColumnDef<Tax>[] => [
  {
    id: "name",
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Nombre" />
    ),
    cell: ({ row }) => {
      const tax = row.original;
      return (
        <div className="flex items-center gap-2">
          <TagIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{tax.name}</span>
        </div>
      );
    },
    meta: {
      label: "Nombre",
      placeholder: "Buscar nombre...",
      variant: "text",
      icon: TagIcon,
    },
    enableGlobalFilter: true,
    enableColumnFilter: false,
    enableSorting: true,
    enableHiding: false,
  },
  {
    id: "rate",
    accessorKey: "rate",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Tasa" />
    ),
    cell: ({ row }) => {
      const rate = row.original.rate;
      return (
        <div className="flex items-center gap-2">
          <PercentIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground text-sm">{rate}%</span>
        </div>
      );
    },
    meta: {
      label: "Tasa",
      variant: "text",
      icon: PercentIcon,
    },
    enableGlobalFilter: false,
    enableColumnFilter: false,
    enableSorting: true,
    enableHiding: false,
  },
  {
    id: "code",
    accessorKey: "code",
    header: "Código",
    cell: ({ row }) => {
      const code = row.original.code;

      if (!code) {
        return <span className="text-muted-foreground">—</span>;
      }

      return (
        <Badge className="font-mono text-xs uppercase" variant="outline">
          {code}
        </Badge>
      );
    },
    enableGlobalFilter: false,
    enableColumnFilter: false,
    enableSorting: false,
    enableHiding: true,
  },
  {
    id: "created_at",
    accessorKey: "created_at",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Fecha de Creación" />
    ),
    cell: ({ row }) => {
      const date = row.original.created_at;
      if (!date) {
        return <span className="text-muted-foreground">—</span>;
      }

      return (
        <span className="text-muted-foreground text-sm">
          {format(new Date(date), "dd 'de' MMMM, yyyy", { locale: es })}
        </span>
      );
    },
    meta: {
      label: "Fecha de Creación",
      variant: "text",
      icon: CalendarIcon,
    },
    enableGlobalFilter: false,
    enableColumnFilter: false,
    enableSorting: true,
    enableHiding: true,
  },
  {
    id: "actions",
    cell: ({ row }) => <TaxActionsCell orgSlug={orgSlug} tax={row.original} />,
    enableHiding: false,
  },
];
