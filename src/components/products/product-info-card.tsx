"use client";

import { CalendarBlank, TagSimple } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AddProductDialog } from "@/components/products/add-product-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { formatDateTime } from "@/lib/utils";
import { updateProductAction } from "@/modules/inventory/actions/product.actions";
import type { Product } from "@/modules/inventory/types";

type ProductInfoCardProps = {
  categories: Array<{ id: string; name: string }>;
  category: { id: string; name: string } | null;
  orgSlug: string;
  product: Product;
  supplier: { id: string; name: string } | null;
  suppliers: Array<{ id: string; name: string }>;
};

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

const unitOfMeasureLabels: Record<Product["unit_of_measure"], string> = {
  UN: "Unidad",
  KG: "Kilogramo",
  LT: "Litro",
  MT: "Metro",
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: UI composition is clearer inline
export function ProductInfoCard({
  categories,
  category,
  orgSlug,
  product,
  supplier,
  suppliers,
}: ProductInfoCardProps) {
  const router = useRouter();
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const createdAt = formatDateTime(product.created_at);
  const updatedAt =
    product.updated_at && product.updated_at !== product.created_at
      ? formatDateTime(product.updated_at)
      : null;

  const handleToggleStatus = () => {
    setStatusError(null);
    startTransition(async () => {
      const result = await updateProductAction({
        orgSlug,
        productId: product.id,
        name: product.name,
        sku: product.sku,
        description: product.description ?? undefined,
        brand: product.brand ?? undefined,
        cost_price: product.cost_price ?? 0,
        sale_price: product.sale_price ?? 0,
        category_id: product.category_id ?? undefined,
        supplier_id: product.supplier_id ?? undefined,
        unit_of_measure: product.unit_of_measure,
        units_per_box: product.units_per_box ?? undefined,
        boxes_per_pallet: product.boxes_per_pallet ?? undefined,
        weight_per_unit: product.weight_per_unit ?? undefined,
        image_url: product.image_url ?? undefined,
        is_active: !product.is_active,
      });

      if (!result.success) {
        setStatusError(result.error || "No se pudo actualizar el estado");
        return;
      }

      setStatusDialogOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <Card className="sticky top-4">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-lg">Producto</CardTitle>
            <CardDescription>Información de referencia</CardDescription>
          </div>
          <AddProductDialog
            categories={categories}
            onUpdated={() => router.refresh()}
            orgSlug={orgSlug}
            product={product}
            suppliers={suppliers}
            trigger={
              <Button size="sm" variant="outline">
                Editar
              </Button>
            }
          />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onClick={() => setStatusDialogOpen(true)}
              type="button"
            >
              <Badge variant={product.is_active ? "default" : "secondary"}>
                {product.is_active ? "Activo" : "Inactivo"}
              </Badge>
            </button>
            <div className="flex items-center gap-1 text-muted-foreground text-sm">
              <TagSimple className="h-4 w-4" weight="regular" />
              <span>SKU {product.sku}</span>
            </div>
          </div>

          <div className="space-y-3">
            <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
              Información comercial
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Nombre</span>
                <span className="text-right font-medium">{product.name}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Marca</span>
                <span className="text-right">
                  {product.brand || "Sin marca"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Categoría</span>
                <span className="text-right">
                  {category?.name || "Sin categoría"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Proveedor</span>
                <span className="text-right">
                  {supplier?.name || "Sin proveedor"}
                </span>
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
              Precios y unidades
            </p>
            <div className="grid gap-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Precio de venta</span>
                <span className="font-semibold">
                  {currencyFormatter.format(product.sale_price || 0)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Costo</span>
                <span className="font-semibold">
                  {currencyFormatter.format(product.cost_price || 0)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Unidad de medida</span>
                <span className="font-medium">
                  {unitOfMeasureLabels[product.unit_of_measure]}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Unidades por caja</span>
                <span className="font-medium">
                  {product.units_per_box ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Cajas por pallet</span>
                <span className="font-medium">
                  {product.boxes_per_pallet ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">
                  Peso por unidad (kg)
                </span>
                <span className="font-medium">
                  {product.weight_per_unit ?? "—"}
                </span>
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-start gap-2">
              <CalendarBlank
                className="mt-0.5 h-4 w-4 text-muted-foreground"
                weight="regular"
              />
              <div>
                <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
                  Creado
                </p>
                <p className="text-sm">{createdAt}</p>
              </div>
            </div>

            {updatedAt && (
              <div className="flex items-start gap-2">
                <CalendarBlank
                  className="mt-0.5 h-4 w-4 text-muted-foreground"
                  weight="regular"
                />
                <div>
                  <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
                    Última modificación
                  </p>
                  <p className="text-sm">{updatedAt}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <Dialog onOpenChange={setStatusDialogOpen} open={statusDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>
              {product.is_active ? "Inactivar producto" : "Activar producto"}
            </DialogTitle>
            <DialogDescription>
              {product.is_active
                ? "El producto dejará de estar disponible para operaciones."
                : "El producto se marcará como activo nuevamente."}
            </DialogDescription>
          </DialogHeader>

          {statusError && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
              {statusError}
            </div>
          )}

          <DialogFooter>
            <Button
              disabled={isPending}
              onClick={() => setStatusDialogOpen(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              disabled={isPending}
              onClick={handleToggleStatus}
              type="button"
            >
              {isPending ? "Guardando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
