"use client";

import { useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { createProductFromInvoiceAction } from "@/modules/purchases/actions/create-product-from-invoice.action";
import {
  type ProductDraft,
  productDraftFromLine,
} from "@/modules/purchases/invoice-import/matching";
import type { ExtractedInvoiceLine } from "@/modules/purchases/invoice-import/schema";
import { productsBySupplierClientQueryOptions } from "@/modules/purchases/queries/queries.client";
import type { ProductWithPrice } from "@/modules/purchases/service/purchases.service";

const UNITS: { value: ProductDraft["unit_of_measure"]; label: string }[] = [
  { value: "UN", label: "Unidades" },
  { value: "KG", label: "Kilos" },
  { value: "LT", label: "Litros" },
  { value: "MT", label: "Metros" },
];

function positiveOrNull(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

type Form = {
  name: string;
  sku: string;
  brand: string;
  unit: ProductDraft["unit_of_measure"];
  weight: string;
  perBox: string;
};

function initialForm(line: ExtractedInvoiceLine): Form {
  const draft = productDraftFromLine(line);
  return {
    name: draft.name,
    sku: draft.sku,
    brand: "",
    unit: draft.unit_of_measure,
    weight: "",
    perBox: "",
  };
}

function Fields({
  form,
  set,
  isBox,
}: {
  form: Form;
  set: (patch: Partial<Form>) => void;
  isBox: boolean;
}) {
  const byMeasure = form.unit === "KG" || form.unit === "LT";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="np-name">Nombre</Label>
        <Input
          id="np-name"
          onChange={(e) => set({ name: e.target.value })}
          value={form.name}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="np-sku">Código (SKU)</Label>
        <Input
          id="np-sku"
          onChange={(e) => set({ sku: e.target.value })}
          placeholder="Ej. el código del proveedor"
          value={form.sku}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="np-brand">Marca (opcional)</Label>
        <Input
          id="np-brand"
          onChange={(e) => set({ brand: e.target.value })}
          value={form.brand}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="np-unit">Se mide en</Label>
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          id="np-unit"
          onChange={(e) =>
            set({ unit: e.target.value as ProductDraft["unit_of_measure"] })
          }
          value={form.unit}
        >
          {UNITS.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
      {byMeasure ? (
        <div className="space-y-1">
          <Label htmlFor="np-weight">
            {form.unit === "KG" ? "Kilos" : "Litros"} por pieza (opcional)
          </Label>
          <Input
            id="np-weight"
            inputMode="decimal"
            onChange={(e) => set({ weight: e.target.value })}
            placeholder="Ej. 4,4 para hormas"
            value={form.weight}
          />
        </div>
      ) : (
        <div className="space-y-1">
          <Label htmlFor="np-box">
            Unidades por caja {isBox ? "" : "(opcional)"}
          </Label>
          <Input
            id="np-box"
            inputMode="numeric"
            onChange={(e) => set({ perBox: e.target.value })}
            value={form.perBox}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Botón y ventana para dar de alta el producto de una línea de la factura
 * que todavía no está en Rhinos.
 */
export function CreateProductFromLine({
  orgSlug,
  supplierId,
  line,
  onCreated,
}: {
  orgSlug: string;
  supplierId: string;
  line: ExtractedInvoiceLine;
  onCreated: (product: ProductWithPrice) => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Form>(() => initialForm(line));
  const isBox = line.unidad === "CAJA";
  const set = (patch: Partial<Form>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    if (isBox && !positiveOrNull(form.perBox)) {
      toast.error("La factura viene en cajas: poné cuántas unidades trae.");
      return;
    }
    setSaving(true);
    const byMeasure = form.unit === "KG" || form.unit === "LT";
    const result = await createProductFromInvoiceAction({
      orgSlug,
      supplierId,
      name: form.name,
      sku: form.sku,
      brand: form.brand || undefined,
      unit_of_measure: form.unit,
      weight_per_unit: byMeasure ? positiveOrNull(form.weight) : null,
      units_per_box: byMeasure
        ? null
        : Math.round(positiveOrNull(form.perBox) ?? 0) || null,
      vatRate: line.alicuota_iva,
    });
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(`Creé "${result.product.name}".`);
    onCreated(result.product);
    queryClient.invalidateQueries({
      queryKey: productsBySupplierClientQueryOptions(orgSlug, supplierId)
        .queryKey,
    });
    setOpen(false);
  };

  return (
    <>
      <Button
        className="h-7 justify-start px-1 text-xs"
        disabled={!supplierId}
        onClick={() => {
          setForm(initialForm(line));
          setOpen(true);
        }}
        size="sm"
        title={supplierId ? undefined : "Primero elegí el proveedor"}
        type="button"
        variant="link"
      >
        <PlusIcon className="size-3" />
        No existe: crear producto
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo producto desde la factura</DialogTitle>
            <DialogDescription>
              Queda cargado con este proveedor
              {line.alicuota_iva === null
                ? ""
                : ` y con IVA ${line.alicuota_iva}%`}
              . El resto (categoría, precio de venta, stock mínimo) lo completás
              después en Productos.
            </DialogDescription>
          </DialogHeader>
          <Fields form={form} isBox={isBox} set={set} />
          <DialogFooter>
            <Button
              disabled={saving}
              onClick={() => setOpen(false)}
              type="button"
              variant="ghost"
            >
              Cancelar
            </Button>
            <Button disabled={saving} onClick={save} type="button">
              {saving ? <Spinner /> : null}
              Crear y usar en la compra
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
