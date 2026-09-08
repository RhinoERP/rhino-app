"use client";

import { DotsThreeOutlineVerticalIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateOnly } from "@/lib/format";
import { deletePriceLevelAction } from "@/modules/price-levels/actions/delete-price-level.action";
import type { PriceLevelWithStatus } from "@/modules/price-levels/types";
import { PriceLevelDialog } from "./price-level-dialog";

type PriceLevelsTableProps = {
  orgSlug: string;
  priceLevels: PriceLevelWithStatus[];
  commissionsEnabled?: boolean;
};

function statusBadge(status: boolean) {
  return status ? (
    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
      Activo
    </Badge>
  ) : (
    <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">
      Inactivo
    </Badge>
  );
}

export function PriceLevelsTable({
  orgSlug,
  priceLevels,
  commissionsEnabled = false,
}: PriceLevelsTableProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<PriceLevelWithStatus | null>(null);
  const [deleting, setDeleting] = useState<PriceLevelWithStatus | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleting) {
      return;
    }
    setDeleteError(null);
    setIsDeleting(true);
    try {
      const result = await deletePriceLevelAction(orgSlug, deleting.id);
      if (!result.success) {
        setDeleteError(result.error ?? "No se pudo eliminar el nivel");
        return;
      }
      toast.success("Nivel de precio eliminado");
      setDeleting(null);
      router.refresh();
    } catch {
      setDeleteError("No se pudo eliminar el nivel de precio");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground text-sm">
            Niveles de margen que se aplican a los clientes (ej. Lista 35, 45,
            55).
          </p>
        </div>
        <PriceLevelDialog
          commissionsEnabled={commissionsEnabled}
          orgSlug={orgSlug}
        />
      </div>

      {priceLevels.length === 0 ? (
        <div className="rounded-md border p-6 text-muted-foreground text-sm">
          No hay niveles de margen creados. Creá el primero para poder asignarlo
          a los clientes.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="text-right">Margen</TableHead>
                {commissionsEnabled && (
                  <TableHead className="text-right">Com. extra</TableHead>
                )}
                <TableHead>Vigencia</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {priceLevels.map((level) => (
                <TableRow key={level.id}>
                  <TableCell className="font-medium">{level.name}</TableCell>
                  <TableCell className="text-right">{level.margin}%</TableCell>
                  {commissionsEnabled && (
                    <TableCell className="text-right">
                      {level.extra_commission_rate ?? 0}%
                    </TableCell>
                  )}
                  <TableCell>
                    {level.valid_from
                      ? `Desde ${formatDateOnly(level.valid_from)}`
                      : "—"}
                  </TableCell>
                  <TableCell>{statusBadge(level.is_active)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label="Acciones"
                          size="icon"
                          variant="ghost"
                        >
                          <DotsThreeOutlineVerticalIcon weight="bold" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(level)}>
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => {
                            setDeleteError(null);
                            setDeleting(level);
                          }}
                        >
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editing && (
        <PriceLevelDialog
          commissionsEnabled={commissionsEnabled}
          onOpenChange={(open) => {
            if (!open) {
              setEditing(null);
            }
          }}
          open
          orgSlug={orgSlug}
          priceLevel={editing}
        />
      )}

      <Dialog
        onOpenChange={(v) => setDeleting(v ? deleting : null)}
        open={Boolean(deleting)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar nivel de precio</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar el nivel{" "}
              <strong>{deleting?.name}</strong>? Los clientes asignados a este
              nivel pasarán a la lista base.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm">
              {deleteError}
            </div>
          )}
          <DialogFooter>
            <Button
              disabled={isDeleting}
              onClick={() => setDeleting(null)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              disabled={isDeleting}
              onClick={handleDelete}
              type="button"
              variant="destructive"
            >
              {isDeleting ? "Eliminando..." : "Sí, eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
