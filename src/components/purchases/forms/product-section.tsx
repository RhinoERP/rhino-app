"use client";

import { CaretUpDownIcon } from "@phosphor-icons/react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProductWithPrice } from "@/modules/purchases/service/purchases.service";
import type { InputUnit } from "@/modules/purchases/utils/purchase-calculations";
import { getUnitLabel } from "@/modules/purchases/utils/purchase-calculations";

type ProductSectionProps = {
  selectedProduct: ProductWithPrice | undefined;
  selectedProductId: string;
  availableProducts: ProductWithPrice[];
  availableUnits: InputUnit[];
  selectButtonLabel: string;
  inputUnit: InputUnit;
  quantity: number | string;
  isAddDisabled: boolean;
  isLoadingProducts: boolean;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectProduct: (productId: string) => void;
  onUnitChange: (unit: InputUnit) => void;
  onQuantityChange: (value: string) => void;
  onQuantityKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onAddItem: () => void;
};

export function ProductSection({
  selectedProduct,
  selectedProductId,
  availableProducts,
  availableUnits,
  selectButtonLabel,
  inputUnit,
  quantity,
  isAddDisabled,
  isLoadingProducts,
  isOpen,
  onOpenChange,
  onSelectProduct,
  onUnitChange,
  onQuantityChange,
  onQuantityKeyDown,
  onAddItem,
}: ProductSectionProps) {
  const showProductConditionals = selectedProduct?.has_variants;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <div className="flex-1 space-y-2">
        <label className="font-medium text-sm" htmlFor="product">
          Producto
        </label>
        <Popover onOpenChange={onOpenChange} open={isOpen}>
          <PopoverTrigger asChild>
            <Button
              aria-expanded={isOpen}
              className="w-full justify-between"
              disabled={isLoadingProducts || availableProducts.length === 0}
              id="product"
              role="combobox"
              variant="outline"
            >
              {selectedProduct ? (
                <div className="flex items-center justify-between gap-4">
                  <span>{selectedProduct.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {formatCurrency(selectedProduct.cost_price ?? 0)}
                  </span>
                </div>
              ) : (
                <span>{selectButtonLabel}</span>
              )}
              <CaretUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-(--radix-popover-trigger-width) p-0"
          >
            <Command>
              <CommandInput placeholder="Buscar producto por nombre o SKU..." />
              <CommandList>
                <CommandEmpty>
                  No se encontraron productos para los filtros aplicados.
                </CommandEmpty>
                <CommandGroup>
                  {/* Filter products that have an id */}
                  {availableProducts
                    .filter((product) => product.id)
                    .map((product) => (
                      <CommandItem
                        key={product.id}
                        keywords={[product.name ?? "", product.sku ?? ""]}
                        onSelect={() => {
                          onSelectProduct(product.id ?? "");
                          onOpenChange(false);
                        }}
                        value={product.id ?? ""}
                      >
                        <div className="flex w-full items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">
                              {product.name}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              SKU {product.sku} ·{" "}
                              {formatCurrency(product.cost_price ?? 0)}
                            </p>
                          </div>
                          <Check
                            className={cn(
                              "h-4 w-4 shrink-0 text-primary transition-opacity",
                              selectedProductId === product.id
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                        </div>
                      </CommandItem>
                    ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {!showProductConditionals && availableUnits.length > 1 && (
        <div className="w-full space-y-2 sm:w-32">
          <Label className="font-medium text-sm" htmlFor="inputUnit">
            Unidad
          </Label>
          <Select
            onValueChange={(value) => onUnitChange(value as InputUnit)}
            value={inputUnit}
          >
            <SelectTrigger id="inputUnit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableUnits.map((unit) => (
                <SelectItem key={unit} value={unit}>
                  {getUnitLabel(unit)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {!showProductConditionals && (
        <div className="w-full space-y-2 sm:w-32">
          <Label className="font-medium text-sm" htmlFor="quantity">
            {selectedProduct ? getUnitLabel(inputUnit) : "Cantidad"}
          </Label>
          <Input
            id="quantity"
            min="0.01"
            onChange={(e) => onQuantityChange(e.target.value)}
            onKeyDown={onQuantityKeyDown}
            placeholder="0"
            step="0.01"
            type="number"
            value={quantity}
          />
        </div>
      )}

      <Button className="sm:mb-0" disabled={isAddDisabled} onClick={onAddItem}>
        Agregar
      </Button>
    </div>
  );
}
