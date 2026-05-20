import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { QuoteItemVariantFormValues } from "@/modules/quotes/types";
import type { SaleProduct } from "@/modules/sales/types";

type ProductVariantsGridDialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  product: SaleProduct | null;
  onConfirm: (variants: QuoteItemVariantFormValues[]) => void;
};

// Talles por defecto como fallback si el producto no tiene variantes predefinidas
const DEFAULT_SIZES = ["S", "M", "L", "XL", "XXL", "Único"];

export function ProductVariantsGridDialog({
  isOpen,
  onOpenChange,
  product,
  onConfirm,
}: ProductVariantsGridDialogProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [sizes, setSizes] = useState<string[]>(DEFAULT_SIZES);
  const [customSize, setCustomSize] = useState("");

  const handleQuantityChange = (size: string, value: string) => {
    const parsed = Number.parseInt(value, 10);
    setQuantities((prev) => ({
      ...prev,
      [size]: Number.isNaN(parsed) ? 0 : parsed,
    }));
  };

  const handleAddCustomSize = () => {
    const trimmed = customSize.trim();
    if (trimmed && !sizes.includes(trimmed)) {
      setSizes([...sizes, trimmed]);
      setCustomSize("");
    }
  };

  const handleConfirm = () => {
    const variants: QuoteItemVariantFormValues[] = Object.entries(quantities)
      .filter(([_, qty]) => qty > 0)
      .map(([size, quantity]) => ({ size, quantity }));

    if (variants.length > 0) {
      onConfirm(variants);
      onOpenChange(false);
    }
  };

  const totalQuantity = Object.values(quantities).reduce(
    (acc, curr) => acc + (curr || 0),
    0
  );

  if (!product) {
    return null;
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Seleccionar talles para {product.name}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <ScrollArea className="max-h-[300px] pr-4">
            <div className="grid grid-cols-2 gap-4">
              {sizes.map((size) => (
                <div
                  className="flex items-center justify-between gap-2 rounded-md border p-2"
                  key={size}
                >
                  <Label className="font-semibold" htmlFor={`qty-${size}`}>
                    {size}
                  </Label>
                  <Input
                    className="w-24 text-right"
                    id={`qty-${size}`}
                    min="0"
                    onChange={(e) => handleQuantityChange(size, e.target.value)}
                    placeholder="0"
                    type="number"
                    value={quantities[size] || ""}
                  />
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="mt-2 flex items-center gap-2">
            <Input
              onChange={(e) => setCustomSize(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCustomSize();
                }
              }}
              placeholder="Agregar otro talle..."
              value={customSize}
            />
            <Button onClick={handleAddCustomSize} variant="secondary">
              Agregar
            </Button>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div className="font-medium text-sm">
            Total unidades: {totalQuantity}
          </div>
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
