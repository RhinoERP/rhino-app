"use client";

import { Check, ChevronsUpDown, Package, TrashIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ProductWithPrice } from "@/modules/purchases/service/purchases.service";

export type PurchaseItem = {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  subtotal: number;
  unit_of_measure: string;
};

const formatCurrency = (amount: number) =>
  amount.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const getUnitLabel = (unit: string | null | undefined): string => {
  const unitMap: Record<string, string> = {
    UN: "un",
    KG: "kg",
    LT: "lt",
    MT: "mt",
  };
  return unit ? unitMap[unit] || unit.toLowerCase() : "un";
};

type PurchaseItemsListProps = {
  products: ProductWithPrice[];
  items: PurchaseItem[];
  onAddItem: (item: PurchaseItem) => void;
  onUpdateItem: (index: number, item: PurchaseItem) => void;
  onRemoveItem: (index: number) => void;
  isLoadingProducts: boolean;
};

export function PurchaseItemsList({
  products,
  items,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  isLoadingProducts,
}: PurchaseItemsListProps) {
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [quantity, setQuantity] = useState<number | string>("");
  const [openProduct, setOpenProduct] = useState(false);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  const handleAddItem = () => {
    if (!(selectedProduct?.id && selectedProduct?.name)) {
      return;
    }

    const parsedQuantity =
      typeof quantity === "string" ? Number.parseInt(quantity, 10) : quantity;

    if (!parsedQuantity || Number.isNaN(parsedQuantity) || parsedQuantity < 1) {
      return;
    }

    const unitCost = selectedProduct.cost_price ?? 0;
    const newItem: PurchaseItem = {
      product_id: selectedProduct.id,
      product_name: selectedProduct.name,
      quantity: parsedQuantity,
      unit_cost: unitCost,
      subtotal: parsedQuantity * unitCost,
      unit_of_measure: selectedProduct.unit_of_measure || "UN",
    };

    onAddItem(newItem);
    setSelectedProductId("");
    setQuantity("");
    setOpenProduct(false);
  };

  const handleUpdateQuantity = (index: number, newQuantity: number) => {
    const item = items[index];
    if (!item) {
      return;
    }

    const updatedItem = {
      ...item,
      quantity: newQuantity,
      subtotal: newQuantity * item.unit_cost,
    };

    onUpdateItem(index, updatedItem);
  };

  const handleUpdateUnitCost = (index: number, newCost: number) => {
    const item = items[index];
    if (!item) {
      return;
    }

    const updatedItem = {
      ...item,
      unit_cost: newCost,
      subtotal: item.quantity * newCost,
    };

    onUpdateItem(index, updatedItem);
  };

  const availableProducts = products.filter(
    (p) => !items.some((item) => item.product_id === p.id)
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Productos de la compra</CardTitle>
        <CardDescription>
          Agregue los productos y cantidades de la orden de compra
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <label className="font-medium text-sm" htmlFor="product">
              Producto
            </label>
            <Popover onOpenChange={setOpenProduct} open={openProduct}>
              <PopoverTrigger asChild>
                <Button
                  aria-expanded={openProduct}
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
                        ${formatCurrency(selectedProduct.cost_price ?? 0)}
                      </span>
                    </div>
                  ) : (
                    <span>
                      {(() => {
                        if (isLoadingProducts) {
                          return "Cargando productos...";
                        }
                        if (availableProducts.length === 0) {
                          return "No hay productos disponibles";
                        }
                        return "Seleccione un producto";
                      })()}
                    </span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-(--radix-popover-trigger-width) p-0"
              >
                <Command>
                  <CommandInput placeholder="Buscar producto..." />
                  <CommandList>
                    <CommandEmpty>No se encontraron productos.</CommandEmpty>
                    <CommandGroup>
                      {availableProducts
                        .filter((product) => product.id)
                        .map((product) => (
                          <CommandItem
                            key={product.id}
                            onSelect={() => {
                              setSelectedProductId(product.id ?? "");
                              setOpenProduct(false);
                            }}
                            value={product.name ?? ""}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedProductId === product.id
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            <div className="flex flex-1 items-center justify-between gap-4">
                              <span>{product.name}</span>
                              <span className="text-muted-foreground text-xs">
                                ${formatCurrency(product.cost_price ?? 0)}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="w-full space-y-2 sm:w-32">
            <label className="font-medium text-sm" htmlFor="quantity">
              Cantidad
            </label>
            <Input
              id="quantity"
              min="1"
              onChange={(e) => setQuantity(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const canAdd =
                    selectedProductId &&
                    quantity &&
                    (typeof quantity === "string"
                      ? Number.parseInt(quantity, 10) >= 1
                      : quantity >= 1);
                  if (canAdd) {
                    handleAddItem();
                  }
                }
              }}
              placeholder="0"
              type="number"
              value={quantity}
            />
          </div>

          <Button
            className="sm:mb-0"
            disabled={
              !(selectedProductId && quantity) ||
              (typeof quantity === "string"
                ? Number.parseInt(quantity, 10) < 1
                : quantity < 1)
            }
            onClick={handleAddItem}
          >
            Agregar
          </Button>
        </div>

        {items.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="w-40">Cantidad</TableHead>
                  <TableHead className="w-48">Precio Unit.</TableHead>
                  <TableHead className="w-32 text-right">Subtotal</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={`${item.product_id}-${index}`}>
                    <TableCell className="font-medium">
                      {item.product_name}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          className="h-8 flex-1"
                          min="1"
                          onChange={(e) => {
                            const value = Number.parseInt(e.target.value, 10);
                            if (!Number.isNaN(value)) {
                              handleUpdateQuantity(index, Math.max(1, value));
                            }
                          }}
                          type="number"
                          value={item.quantity}
                        />
                        <span className="text-muted-foreground text-sm">
                          {getUnitLabel(item.unit_of_measure)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">$</span>
                        <Input
                          className="h-8 flex-1"
                          min="0"
                          onChange={(e) => {
                            const value = Number.parseFloat(e.target.value);
                            if (!Number.isNaN(value)) {
                              handleUpdateUnitCost(index, value);
                            } else if (e.target.value === "") {
                              handleUpdateUnitCost(index, 0);
                            }
                          }}
                          placeholder="0.00"
                          step="0.01"
                          type="number"
                          value={item.unit_cost || ""}
                        />
                        <span className="text-muted-foreground text-sm">
                          / {getUnitLabel(item.unit_of_measure)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      ${formatCurrency(item.subtotal)}
                    </TableCell>
                    <TableCell>
                      <Button
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => onRemoveItem(index)}
                        size="sm"
                        variant="ghost"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              No hay productos agregados. Seleccione un proveedor y agregue
              productos.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
