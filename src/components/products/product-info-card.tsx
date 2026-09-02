"use client";

import { CalendarBlank, TagSimple } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { usePermissions } from "@/components/auth/permissions-provider";
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
import { Switch } from "@/components/ui/switch";
import { formatDateTime } from "@/lib/utils";
import { updateProductAction } from "@/modules/inventory/actions/product.actions";
import type { Product } from "@/modules/inventory/types";
import type { Tax } from "@/modules/taxes/types";

type ProductInfoCardProps = {
  categories: Array<{ id: string; name: string }>;
  category: { id: string; name: string } | null;
  orgSlug: string;
  product: Product;
  costPrice: number | null;
  salePrice: number | null;
  selectedProductTaxIds?: string[];
  supplier: { id: string; name: string } | null;
  suppliers: Array<{ id: string; name: string }>;
  isProductionEnabled?: boolean;
  taxes?: Tax[];
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

const resolveSalePriceValue = (
  providedSalePrice?: number | null,
  productSalePrice?: number | null
): number | null => {
  if (typeof providedSalePrice === "number") {
    return providedSalePrice;
  }
  if (typeof productSalePrice === "number") {
    return productSalePrice;
  }
  return null;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: UI composition is clearer inline
export function ProductInfoCard({
  categories,
  category,
  orgSlug,
  product,
  costPrice,
  salePrice,
  selectedProductTaxIds = [],
  supplier,
  suppliers,
  isProductionEnabled,
  taxes = [],
}: ProductInfoCardProps) {
  const router = useRouter();
  const { can } = usePermissions();
  const canManageInventory = can("inventory.manage");
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(product.is_active);
  const [isPending, startTransition] = useTransition();

  const createdAt = formatDateTime(product.created_at);
  const updatedAt =
    product.updated_at && product.updated_at !== product.created_at
      ? formatDateTime(product.updated_at)
      : null;
  const resolvedSalePrice = resolveSalePriceValue(
    salePrice,
    product.sale_price
  );
  const resolvedCostPrice = typeof costPrice === "number" ? costPrice : null;
  const formattedSalePrice =
    resolvedSalePrice != null
      ? currencyFormatter.format(resolvedSalePrice)
      : "—";
  const formattedCostPrice =
    resolvedCostPrice != null
      ? currencyFormatter.format(resolvedCostPrice)
      : "—";
  const formattedProfitMargin =
    typeof product.profit_margin === "number"
      ? `${product.profit_margin.toLocaleString("es-AR", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })}%`
      : "—";
  const isWeightBased =
    product.unit_of_measure === "KG" || product.unit_of_measure === "LT";
  let trackingUnitsLabel = "No aplica";
  if (isWeightBased) {
    trackingUnitsLabel = product.tracks_stock_units ? "Activo" : "Inactivo";
  }

  useEffect(() => {
    setIsActive(product.is_active);
  }, [product.is_active]);

  const handleToggleStatus = (nextActive?: boolean) => {
    setStatusError(null);
    const previousStatus = isActive;
    const targetStatus =
      typeof nextActive === "boolean" ? nextActive : !isActive;
    const salePriceForUpdate =
      resolveSalePriceValue(salePrice, product.sale_price) ?? undefined;

    setIsActive(targetStatus);
    startTransition(async () => {
      const result = await updateProductAction({
        orgSlug,
        productId: product.id,
        name: product.name,
        sku: product.sku,
        description: product.description ?? undefined,
        brand: product.brand ?? undefined,
        sale_price: salePriceForUpdate,
        category_id: product.category_id ?? undefined,
        supplier_id: product.supplier_id ?? undefined,
        unit_of_measure: product.unit_of_measure,
        units_per_box: product.units_per_box ?? undefined,
        boxes_per_pallet: product.boxes_per_pallet ?? undefined,
        weight_per_unit: product.weight_per_unit ?? undefined,
        image_url: product.image_url ?? undefined,
        is_active: targetStatus,
        tracks_stock_units: Boolean(product.tracks_stock_units),
      });

      if (!result.success) {
        setStatusError(result.error || "No se pudo actualizar el estado");
        setIsActive(previousStatus);
        return;
      }

      setStatusDialogOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <div className="space-y-3 lg:sticky lg:top-4">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-lg">
                Información del Producto
              </CardTitle>
              <CardDescription>Datos comerciales</CardDescription>
            </div>
            {canManageInventory ? (
              <AddProductDialog
                categories={categories}
                isProductionEnabled={isProductionEnabled}
                onUpdated={() => router.refresh()}
                orgSlug={orgSlug}
                product={product}
                selectedProductTaxIds={selectedProductTaxIds}
                suppliers={suppliers}
                taxes={taxes}
                trigger={
                  <Button size="sm" variant="outline">
                    Editar
                  </Button>
                }
              />
            ) : null}
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {canManageInventory ? (
                <button
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={() => setStatusDialogOpen(true)}
                  type="button"
                >
                  <Badge variant={isActive ? "default" : "secondary"}>
                    {isActive ? "Activo" : "Inactivo"}
                  </Badge>
                </button>
              ) : (
                <Badge variant={isActive ? "default" : "secondary"}>
                  {isActive ? "Activo" : "Inactivo"}
                </Badge>
              )}
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
                  <span className="max-w-[60%] truncate text-right font-medium">
                    {product.name}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Marca</span>
                  <span className="max-w-[60%] truncate text-right">
                    {product.brand || "Sin marca"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Categoría</span>
                  <span className="max-w-[60%] truncate text-right">
                    {category?.name || "Sin categoría"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Proveedor</span>
                  <span className="max-w-[60%] truncate text-right">
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
                  <span className="font-semibold">{formattedSalePrice}</span>
                </div>
                {canManageInventory ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Costo</span>
                      <span className="font-semibold">
                        {formattedCostPrice}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Margen (%)</span>
                      <span className="font-semibold">
                        {formattedProfitMargin}
                      </span>
                    </div>
                  </>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    Unidad de medida
                  </span>
                  <span className="font-medium">
                    {unitOfMeasureLabels[product.unit_of_measure]}
                  </span>
                </div>{" "}
                {isWeightBased && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">
                      Seguimiento de unidades
                    </span>
                    <span className="font-medium">{trackingUnitsLabel}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Packaging Info - Hide on mobile to save space */}
            <div className="hidden space-y-3 lg:block">
              <Separator />
              <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
                Empaque
              </p>
              <div className="grid gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    Unidades por caja
                  </span>
                  <span className="font-medium">
                    {product.units_per_box ?? "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    Cajas por pallet
                  </span>
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

            {/* Dates - Desktop only */}
            <div className="hidden space-y-4 lg:block">
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
            </div>
          </CardContent>
        </Card>

        {canManageInventory ? (
          <div className="hidden rounded-lg border bg-card px-4 py-3 shadow-sm lg:block">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <p className="font-semibold text-sm leading-none">
                  Deshabilitar producto
                </p>
                <p className="text-muted-foreground text-xs">
                  Evita que se use en nuevas operaciones.
                </p>
              </div>
              <Switch
                aria-label="Deshabilitar producto"
                checked={!isActive}
                disabled={isPending}
                onCheckedChange={(checked) => handleToggleStatus(!checked)}
              />
            </div>
            {!statusDialogOpen && statusError && (
              <p className="mt-2 text-destructive text-xs">{statusError}</p>
            )}
          </div>
        ) : null}
      </div>
      <Dialog onOpenChange={setStatusDialogOpen} open={statusDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>
              {isActive ? "Inactivar producto" : "Activar producto"}
            </DialogTitle>
            <DialogDescription>
              {isActive
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
              onClick={() => handleToggleStatus()}
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
