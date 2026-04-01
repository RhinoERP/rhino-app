"use client";

import {
  DotsThreeOutlineVerticalIcon,
  LightningIcon,
  StarIcon,
} from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  CalendarIcon,
  CircleHelpIcon,
  PercentIcon,
  TagIcon,
} from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTaxMutations } from "@/modules/taxes/hooks/use-taxes-mutations";
import type { Tax, TaxFavoriteContext } from "@/modules/taxes/types";

type TaxActionsCellProps = {
  tax: Tax;
  orgSlug: string;
};

function TaxFavoriteCell({ tax, orgSlug }: TaxActionsCellProps) {
  const { toggleFavorite } = useTaxMutations(orgSlug);
  const [updatingContext, setUpdatingContext] =
    useState<TaxFavoriteContext | null>(null);
  const isFavoriteSales = Boolean(tax.is_favorite_sales);
  const isFavoriteDirectSales = Boolean(tax.is_favorite_direct_sales);

  const handleToggle = async (
    context: TaxFavoriteContext,
    isFavorite: boolean
  ) => {
    setUpdatingContext(context);
    try {
      await toggleFavorite.mutateAsync({
        taxId: tax.id,
        context,
        isFavorite,
      });
    } catch (error) {
      console.error("Error toggling favorite tax:", error);
    } finally {
      setUpdatingContext(null);
    }
  };

  return (
    <div className="flex justify-center gap-1">
      <Button
        aria-label={
          isFavoriteSales
            ? "Quitar favorito en ventas"
            : "Marcar favorito en ventas"
        }
        className="h-8 w-8 p-0"
        disabled={updatingContext !== null}
        onClick={() => handleToggle("sales", !isFavoriteSales)}
        title={
          isFavoriteSales
            ? "Quitar favorito de Ventas"
            : "Marcar favorito para Ventas"
        }
        variant="ghost"
      >
        <StarIcon
          className={`h-4 w-4 ${
            isFavoriteSales ? "text-amber-500" : "text-muted-foreground"
          }`}
          weight={isFavoriteSales ? "fill" : "regular"}
        />
      </Button>
      <Button
        aria-label={
          isFavoriteDirectSales
            ? "Quitar favorito en venta directa"
            : "Marcar favorito en venta directa"
        }
        className="h-8 w-8 p-0"
        disabled={updatingContext !== null}
        onClick={() => handleToggle("direct_sales", !isFavoriteDirectSales)}
        title={
          isFavoriteDirectSales
            ? "Quitar favorito de Venta Directa"
            : "Marcar favorito para Venta Directa"
        }
        variant="ghost"
      >
        <LightningIcon
          className={`h-4 w-4 ${
            isFavoriteDirectSales ? "text-sky-600" : "text-muted-foreground"
          }`}
          weight={isFavoriteDirectSales ? "fill" : "regular"}
        />
      </Button>
    </div>
  );
}

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

function FavoriteHeader() {
  return (
    <div className="flex items-center gap-1.5">
      <span>Favoritos</span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-help text-muted-foreground">
              <CircleHelpIcon className="h-3.5 w-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p>
              Estrella: favorito para Ventas. Rayo: favorito para Venta Directa.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

export const createColumns = (orgSlug: string): ColumnDef<Tax>[] => [
  {
    id: "favorite",
    header: () => <FavoriteHeader />,
    cell: ({ row }) => <TaxFavoriteCell orgSlug={orgSlug} tax={row.original} />,
    enableGlobalFilter: false,
    enableColumnFilter: false,
    enableSorting: false,
    enableHiding: false,
  },
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
