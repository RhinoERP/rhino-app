"use client";

import { PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteAssignmentAction } from "@/modules/customer-supplier-assignments/actions/delete-assignment.action";
import { upsertAssignmentAction } from "@/modules/customer-supplier-assignments/actions/upsert-assignment.action";
import type { CustomerSupplierAssignment } from "@/modules/customer-supplier-assignments/types";
import type { PriceList } from "@/modules/price-lists/types";
import type { SalesPriceList } from "@/modules/sales-price-lists/types";

type Supplier = { id: string; name: string };

type Props = {
  orgSlug: string;
  customerId: string;
  assignments: CustomerSupplierAssignment[];
  suppliers: Supplier[];
  priceLists: PriceList[];
  salesPriceLists: SalesPriceList[];
};

type DialogState = {
  open: boolean;
  assignment?: CustomerSupplierAssignment;
};

const NONE = "__none__";

export function SupplierAssignmentsCard({
  orgSlug,
  customerId,
  assignments,
  suppliers,
  priceLists,
  salesPriceLists,
}: Props) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>({ open: false });
  const [supplierId, setSupplierId] = useState("");
  const [priceListId, setPriceListId] = useState(NONE);
  const [salesPriceListId, setSalesPriceListId] = useState(NONE);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const assignedSupplierIds = new Set(assignments.map((a) => a.supplier_id));

  const openNew = () => {
    setSupplierId("");
    setPriceListId(NONE);
    setSalesPriceListId(NONE);
    setDialog({ open: true });
  };

  const openEdit = (a: CustomerSupplierAssignment) => {
    setSupplierId(a.supplier_id);
    setPriceListId(a.price_list_id ?? NONE);
    setSalesPriceListId(a.sales_price_list_id ?? NONE);
    setDialog({ open: true, assignment: a });
  };

  const availableSuppliers = dialog.assignment
    ? suppliers
    : suppliers.filter((s) => !assignedSupplierIds.has(s.id));

  const filteredPriceLists = supplierId
    ? priceLists.filter((pl) => pl.supplier_id === supplierId)
    : [];

  const handleSave = async () => {
    if (!supplierId) {
      toast.error("Seleccioná un proveedor");
      return;
    }
    setSaving(true);
    const result = await upsertAssignmentAction(orgSlug, {
      customerId,
      supplierId,
      priceListId: priceListId === NONE ? null : priceListId,
      salesPriceListId: salesPriceListId === NONE ? null : salesPriceListId,
    });
    setSaving(false);
    if (result.success) {
      toast.success("Asignación guardada");
      setDialog({ open: false });
      router.refresh();
    } else {
      toast.error(result.error ?? "Error guardando asignación");
    }
  };

  const handleDelete = async (assignmentId: string) => {
    setDeletingId(assignmentId);
    const result = await deleteAssignmentAction(orgSlug, assignmentId);
    setDeletingId(null);
    if (result.success) {
      toast.success("Asignación eliminada");
      router.refresh();
    } else {
      toast.error(result.error ?? "Error eliminando asignación");
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="font-semibold text-sm">
            Listas por proveedor
          </CardTitle>
          <Button onClick={openNew} size="sm" variant="outline">
            <PlusIcon className="mr-1.5 size-4" weight="bold" />
            Agregar
          </Button>
        </CardHeader>
        <CardContent>
          {assignments.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Sin asignaciones. Agregá una lista por proveedor para este
              cliente.
            </p>
          ) : (
            <div className="divide-y text-sm">
              {assignments.map((a) => (
                <div
                  className="flex items-center justify-between gap-2 py-2"
                  key={a.id}
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate font-medium">
                      {a.supplier_name ?? a.supplier_id}
                    </p>
                    <p className="truncate text-muted-foreground text-xs">
                      {a.price_list_name
                        ? `Compra: ${a.price_list_name}`
                        : "Sin lista de compra"}
                      {" · "}
                      {a.sales_price_list_name
                        ? `Venta: ${a.sales_price_list_name}`
                        : "Sin lista de venta"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      onClick={() => openEdit(a)}
                      size="icon"
                      variant="ghost"
                    >
                      <PencilSimpleIcon className="size-4" />
                    </Button>
                    <Button
                      disabled={deletingId === a.id}
                      onClick={() => handleDelete(a.id)}
                      size="icon"
                      variant="ghost"
                    >
                      <TrashIcon className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog onOpenChange={(v) => setDialog({ open: v })} open={dialog.open}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialog.assignment ? "Editar asignación" : "Nueva asignación"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Proveedor</Label>
              <Select
                disabled={Boolean(dialog.assignment)}
                onValueChange={setSupplierId}
                value={supplierId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccioná un proveedor" />
                </SelectTrigger>
                <SelectContent>
                  {availableSuppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Lista de precios de compra</Label>
              <Select
                disabled={!supplierId}
                onValueChange={setPriceListId}
                value={priceListId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin lista de compra" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin lista de compra</SelectItem>
                  {filteredPriceLists.map((pl) => (
                    <SelectItem key={pl.id} value={pl.id}>
                      {pl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {supplierId && filteredPriceLists.length === 0 && (
                <p className="text-muted-foreground text-xs">
                  Este proveedor no tiene listas de precios importadas.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Lista de precios de venta</Label>
              <Select
                onValueChange={setSalesPriceListId}
                value={salesPriceListId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin lista de venta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin lista de venta</SelectItem>
                  {salesPriceLists.map((sl) => (
                    <SelectItem key={sl.id} value={sl.id}>
                      {sl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => setDialog({ open: false })}
              variant="outline"
            >
              Cancelar
            </Button>
            <Button disabled={saving} onClick={handleSave}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
