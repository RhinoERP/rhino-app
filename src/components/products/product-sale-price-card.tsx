"use client";

import { CircleDollarSign } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProductAction } from "@/modules/inventory/actions/product.actions";
import type { Product } from "@/modules/inventory/types";
import { calculateSalePriceFromCostAndMargin } from "@/modules/inventory/utils/price-calculations";

type ProductSalePriceCardProps = {
  orgSlug: string;
  product: Product;
  costPrice: number | null;
  salePrice: number | null;
};

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

const roundToFourDecimals = (value: number) =>
  Math.round(value * 10_000) / 10_000;

const formatMoney = (value: number | null) =>
  value != null ? currencyFormatter.format(value) : "—";

const parseNumericInput = (value: string): number | null => {
  let normalized = value.trim();
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = normalized.replace(",", ".");
  }

  if (!normalized) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return parsed;
};

const formatMarginInput = (value: number | null) =>
  value != null
    ? value.toLocaleString("es-AR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
        useGrouping: false,
      })
    : "";

const formatSalePriceInput = (value: number | null) =>
  value != null
    ? value.toLocaleString("es-AR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
        useGrouping: false,
      })
    : "";

const formatMarginDisplay = (value: number | null) =>
  value != null
    ? `${value.toLocaleString("es-AR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}%`
    : "—";

function resolveSalePrice(costPrice: number | null, margin: number | null) {
  return calculateSalePriceFromCostAndMargin(costPrice, margin);
}

export function ProductSalePriceCard({
  orgSlug,
  product,
  costPrice,
  salePrice,
}: ProductSalePriceCardProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marginInput, setMarginInput] = useState(
    formatMarginInput(product.profit_margin)
  );
  const [salePriceInput, setSalePriceInput] = useState(
    formatSalePriceInput(salePrice)
  );
  const [isPending, startTransition] = useTransition();

  const currentMargin =
    typeof product.profit_margin === "number" ? product.profit_margin : null;
  const canCalculateFromCost = costPrice != null && costPrice > 0;
  const parsedMargin = parseNumericInput(marginInput);
  const parsedSalePrice = parseNumericInput(salePriceInput);

  const previewMargin = parsedMargin ?? currentMargin;
  const previewSalePrice = useMemo(() => {
    if (parsedSalePrice != null) {
      return parsedSalePrice;
    }
    const calculated = resolveSalePrice(costPrice, previewMargin);
    if (calculated != null) {
      return calculated;
    }
    return salePrice;
  }, [costPrice, parsedSalePrice, previewMargin, salePrice]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setMarginInput(formatMarginInput(currentMargin));
      const currentSalePrice = resolveSalePrice(costPrice, currentMargin);
      setSalePriceInput(formatSalePriceInput(currentSalePrice ?? salePrice));
      setError(null);
    }
  };

  const handleMarginChange = (value: string) => {
    setMarginInput(value);
    setError(null);

    const nextMargin = parseNumericInput(value);
    if (nextMargin == null || !canCalculateFromCost) {
      return;
    }

    const nextSalePrice = resolveSalePrice(costPrice, nextMargin);
    setSalePriceInput(formatSalePriceInput(nextSalePrice));
  };

  const handleSalePriceChange = (value: string) => {
    setSalePriceInput(value);
    setError(null);

    const nextSalePrice = parseNumericInput(value);
    if (nextSalePrice == null || !canCalculateFromCost || costPrice == null) {
      return;
    }

    const nextMargin = roundToFourDecimals(
      (nextSalePrice / costPrice - 1) * 100
    );
    setMarginInput(formatMarginInput(nextMargin));
  };

  const handleSave = () => {
    const nextMargin = parseNumericInput(marginInput);
    if (nextMargin == null) {
      setError("Ingresa un margen válido");
      return;
    }

    if (nextMargin < 0) {
      setError("El margen debe ser mayor o igual a 0");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await updateProductAction({
        orgSlug,
        productId: product.id,
        name: product.name,
        sku: product.sku,
        description: product.description ?? undefined,
        brand: product.brand ?? undefined,
        sale_price: product.sale_price ?? undefined,
        profit_margin: nextMargin,
        min_stock: product.min_stock ?? undefined,
        category_id: product.category_id ?? undefined,
        supplier_id: product.supplier_id ?? undefined,
        unit_of_measure: product.unit_of_measure,
        units_per_box: product.units_per_box ?? undefined,
        boxes_per_pallet: product.boxes_per_pallet ?? undefined,
        weight_per_unit: product.weight_per_unit ?? undefined,
        image_url: product.image_url ?? undefined,
        is_active: product.is_active ?? true,
        tracks_stock_units: Boolean(product.tracks_stock_units),
      });

      if (!result.success) {
        setError(result.error || "No se pudo actualizar el margen");
        return;
      }

      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        <button className="w-full text-left" type="button">
          <Card className="cursor-pointer transition-colors hover:bg-muted/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div className="flex items-center gap-2">
                <div className="rounded-full bg-emerald-500/10 p-2 text-emerald-500">
                  <CircleDollarSign className="h-4 w-4" />
                </div>
                <CardTitle className="text-base">Precio de venta</CardTitle>
              </div>
              <div className="text-right">
                <p className="font-semibold text-2xl">
                  {formatMoney(salePrice)}
                </p>
                <p className="text-muted-foreground text-sm">Por unidad</p>
              </div>
            </CardHeader>
          </Card>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar margen de ganancia</DialogTitle>
          <DialogDescription>
            Puedes ajustar margen o precio de venta. Ambos se recalculan al
            momento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="margin-input">Margen (%)</Label>
            <Input
              autoFocus
              disabled={isPending}
              id="margin-input"
              inputMode="decimal"
              onChange={(event) => handleMarginChange(event.target.value)}
              placeholder="Ej: 25"
              value={marginInput}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="sale-price-input">Precio de venta</Label>
            <Input
              disabled={isPending}
              id="sale-price-input"
              inputMode="decimal"
              onChange={(event) => handleSalePriceChange(event.target.value)}
              placeholder="Ej: 550"
              value={salePriceInput}
            />
          </div>

          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Costo</span>
              <span className="font-medium">{formatMoney(costPrice)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Margen (%)</span>
              <span className="font-medium">
                {formatMarginDisplay(previewMargin)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Precio de venta</span>
              <span className="font-semibold">
                {formatMoney(previewSalePrice)}
              </span>
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            disabled={isPending}
            onClick={() => setOpen(false)}
            type="button"
            variant="outline"
          >
            Cancelar
          </Button>
          <Button disabled={isPending} onClick={handleSave} type="button">
            {isPending ? "Guardando..." : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
