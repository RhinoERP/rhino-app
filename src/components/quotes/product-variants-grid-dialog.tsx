"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { VariantStockMatrix } from "@/components/products/variant-stock-matrix";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useProductVariants } from "@/modules/inventory/hooks/use-product-variants";
import type { QuoteItemVariantFormValues } from "@/modules/quotes/types";
import type { SaleProduct } from "@/modules/sales/types";

type ProductVariantsGridDialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  product: SaleProduct | null;
  orgSlug: string;
  onConfirm: (variants: QuoteItemVariantFormValues[]) => void;
  initialQuantities?: Record<string, Record<string, number>>;
};

export function ProductVariantsGridDialog({
  isOpen,
  onOpenChange,
  product,
  orgSlug,
  onConfirm,
  initialQuantities,
}: ProductVariantsGridDialogProps) {
  const [quantities, setQuantities] = useState<
    Record<string, Record<string, number>>
  >({});

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (initialQuantities && Object.keys(initialQuantities).length > 0) {
      setQuantities(initialQuantities);
    } else {
      setQuantities({});
    }
  }, [isOpen, initialQuantities]);

  const enabled = isOpen && !!product;

  const { data: variants, isLoading } = useProductVariants(
    orgSlug,
    product?.id ?? ""
  );

  const talles = useMemo(() => {
    if (!variants || variants.length === 0) {
      return [];
    }
    const set = new Set(variants.map((v) => v.talle).filter(Boolean));
    return Array.from(set).sort();
  }, [variants]);

  const colores = useMemo(() => {
    if (!variants || variants.length === 0) {
      return [];
    }
    const set = new Set(variants.map((v) => v.color).filter(Boolean));
    return Array.from(set).sort();
  }, [variants]);

  const stocks = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    for (const color of colores) {
      result[color] = {};
      for (const talle of talles) {
        result[color][talle] = quantities[color]?.[talle] ?? 0;
      }
    }
    return result;
  }, [talles, colores, quantities]);

  const handleChange = useCallback(
    (color: string, talle: string, value: number) => {
      setQuantities((prev) => {
        const copy = { ...prev };
        if (!copy[color]) {
          copy[color] = {};
        }
        copy[color][talle] = value;
        return copy;
      });
    },
    []
  );

  const handleConfirm = () => {
    const result: QuoteItemVariantFormValues[] = [];
    for (const color of Object.keys(quantities)) {
      for (const talle of Object.keys(quantities[color])) {
        const qty = quantities[color][talle];
        if (qty > 0) {
          const variant = variants?.find(
            (v) => v.talle === talle && v.color === color
          );
          result.push({
            talle,
            color,
            quantity: qty,
            productVariantId: variant?.id,
          });
        }
      }
    }
    if (result.length > 0) {
      onConfirm(result);
      setQuantities({});
      onOpenChange(false);
    }
  };

  const totalQuantity = Object.values(quantities).reduce(
    (sum, colors) =>
      sum + Object.values(colors).reduce((a, b) => a + (b || 0), 0),
    0
  );

  if (!product) {
    return null;
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Seleccionar variantes para {product.name}</DialogTitle>
        </DialogHeader>
        <VariantStockMatrix
          colores={colores}
          editable
          isLoading={isLoading && enabled}
          onChange={handleChange}
          stocks={stocks}
          talles={talles}
        />
        <DialogFooter className="flex items-center justify-between">
          <span className="font-medium text-sm">Total: {totalQuantity}</span>
          <div className="flex gap-2">
            <Button onClick={() => onOpenChange(false)} variant="outline">
              Cancelar
            </Button>
            <Button disabled={totalQuantity === 0} onClick={handleConfirm}>
              Confirmar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
