"use client";

import {
  DotsThreeOutlineVerticalIcon,
  EnvelopeSimpleIcon,
  PhoneIcon,
  TruckIcon,
} from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { CarrierDialog } from "@/components/carriers/carrier-dialog";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
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
import { useCarrierMutations } from "@/modules/carriers/hooks/use-carriers-mutations";
import type { Carrier } from "@/modules/carriers/service/carriers.service";

type CarrierActionsCellProps = {
  carrier: Carrier;
  orgSlug: string;
};

function CarrierActionsCell({ carrier, orgSlug }: CarrierActionsCellProps) {
  const { deleteCarrier } = useCarrierMutations(orgSlug);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteCarrier.mutateAsync(carrier.id);
      setShowDeleteDialog(false);
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
        <CarrierDialog
          carrier={carrier}
          onOpenChange={setShowEditDialog}
          open={showEditDialog}
          orgSlug={orgSlug}
        />
      )}

      <Dialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Estás seguro?</DialogTitle>
            <DialogDescription>
              Esta acción desactivará el transporte "{carrier.name}". Las ventas
              ya asociadas no se verán afectadas.
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

export const createCarrierColumns = (orgSlug: string): ColumnDef<Carrier>[] => [
  {
    id: "name",
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Nombre" />
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <TruckIcon className="h-4 w-4 text-muted-foreground" weight="duotone" />
        <span className="font-medium">{row.original.name}</span>
      </div>
    ),
    meta: {
      label: "Nombre",
      placeholder: "Buscar transporte...",
      variant: "text",
    },
    enableGlobalFilter: true,
    enableColumnFilter: false,
    enableSorting: true,
    enableHiding: false,
  },
  {
    id: "phone",
    accessorKey: "phone",
    header: "Teléfono",
    cell: ({ row }) => {
      const phone = row.original.phone;
      if (!phone) {
        return <span className="text-muted-foreground">—</span>;
      }
      return (
        <div className="flex items-center gap-2 text-sm">
          <PhoneIcon
            className="h-3.5 w-3.5 text-muted-foreground"
            weight="duotone"
          />
          {phone}
        </div>
      );
    },
    enableGlobalFilter: false,
    enableColumnFilter: false,
    enableSorting: false,
    enableHiding: true,
  },
  {
    id: "email",
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => {
      const email = row.original.email;
      if (!email) {
        return <span className="text-muted-foreground">—</span>;
      }
      return (
        <div className="flex items-center gap-2 text-sm">
          <EnvelopeSimpleIcon
            className="h-3.5 w-3.5 text-muted-foreground"
            weight="duotone"
          />
          {email}
        </div>
      );
    },
    enableGlobalFilter: false,
    enableColumnFilter: false,
    enableSorting: false,
    enableHiding: true,
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <CarrierActionsCell carrier={row.original} orgSlug={orgSlug} />
    ),
    enableHiding: false,
  },
];
