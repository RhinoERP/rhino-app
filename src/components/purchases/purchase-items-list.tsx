"use client";

import {
  CaretUpDownIcon,
  CheckIcon,
  PackageIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProductWithPrice } from "@/modules/purchases/service/purchases.service";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Frame } from "../ui/frame";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export type PurchaseItem = {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  subtotal: number;
  unit_of_measure: string;
  weight_per_unit?: number | null;
  total_weight_kg?: number;
  price_per_kg?: number;
};

const formatCurrency = (amount: number) =>
  amount.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const calculateTotalWeight = (
  quantity: number,
  weightPerUnit: number | null | undefined,
  unitOfMeasure: string | null | undefined
): number | null => {
  if (
    !(weightPerUnit && unitOfMeasure) ||
    unitOfMeasure !== "KG" ||
    weightPerUnit <= 0
  ) {
    return null;
  }
  return quantity * weightPerUnit;
};

const formatWeight = (weight: number | null): string => {
  if (weight === null) {
    return "";
  }
  return weight.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const calculatePricePerKg = (
  weightPerUnit: number | null | undefined,
  unitOfMeasure: string | null | undefined,
  unitCost: number
): number | undefined => {
  if (!weightPerUnit || unitOfMeasure !== "KG" || weightPerUnit <= 0) {
    return;
  }
  return unitCost / weightPerUnit;
};

const calculateSubtotal = (
  totalWeight: number | null,
  pricePerKg: number | undefined,
  quantity: number,
  unitCost: number
): number => {
  if (totalWeight && pricePerKg) {
    return totalWeight * pricePerKg;
  }
  return quantity * unitCost;
};

const buildPurchaseItem = (
  product: ProductWithPrice,
  quantity: number
): PurchaseItem | null => {
  const unitCost = product.cost_price ?? 0;
  const unitOfMeasure = product.unit_of_measure || "UN";
  const weightPerUnit = product.weight_per_unit;
  const totalWeight = calculateTotalWeight(
    quantity,
    weightPerUnit,
    unitOfMeasure
  );
  const pricePerKg = calculatePricePerKg(
    weightPerUnit,
    unitOfMeasure,
    unitCost
  );
  const subtotal = calculateSubtotal(
    totalWeight,
    pricePerKg,
    quantity,
    unitCost
  );

  if (!(product.id && product.name)) {
    return null;
  }

  return {
    product_id: product.id,
    product_name: product.name,
    quantity,
    unit_cost: unitCost,
    subtotal,
    unit_of_measure: unitOfMeasure,
    weight_per_unit: weightPerUnit,
    total_weight_kg: totalWeight ?? undefined,
    price_per_kg: pricePerKg,
  };
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
    if (!selectedProduct) {
      return;
    }

    const parsedQuantity =
      typeof quantity === "string" ? Number.parseInt(quantity, 10) : quantity;

    if (Number.isNaN(parsedQuantity) || parsedQuantity < 1) {
      return;
    }

    const newItem = buildPurchaseItem(selectedProduct, parsedQuantity);
    if (!newItem) {
      return;
    }
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

    const validatedQuantity = Math.max(0, newQuantity);

    const totalWeight = calculateTotalWeight(
      validatedQuantity,
      item.weight_per_unit,
      item.unit_of_measure
    );

    const subtotal =
      totalWeight && item.price_per_kg
        ? totalWeight * item.price_per_kg
        : newQuantity * item.unit_cost;

    const updatedItem = {
      ...item,
      quantity: newQuantity,
      subtotal,
      total_weight_kg: totalWeight ?? undefined,
    };

    onUpdateItem(index, updatedItem);
  };

  const handleUpdateUnitCost = (index: number, newCost: number) => {
    const item = items[index];
    if (!item) {
      return;
    }

    let pricePerKg = item.price_per_kg;
    if (
      item.weight_per_unit &&
      item.unit_of_measure === "KG" &&
      item.weight_per_unit > 0
    ) {
      pricePerKg = newCost / item.weight_per_unit;
    }

    const subtotal =
      item.total_weight_kg && pricePerKg
        ? item.total_weight_kg * pricePerKg
        : item.quantity * newCost;

    const updatedItem = {
      ...item,
      unit_cost: newCost,
      price_per_kg: pricePerKg,
      subtotal,
    };

    onUpdateItem(index, updatedItem);
  };

  const handleUpdatePricePerKg = (index: number, newPricePerKg: number) => {
    const item = items[index];
    if (!item) {
      return;
    }

    const unitCost =
      item.weight_per_unit && item.weight_per_unit > 0
        ? newPricePerKg * item.weight_per_unit
        : item.unit_cost;

    const subtotal = item.total_weight_kg
      ? item.total_weight_kg * newPricePerKg
      : item.quantity * unitCost;

    const updatedItem = {
      ...item,
      unit_cost: unitCost,
      price_per_kg: newPricePerKg,
      subtotal,
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
      <CardContent>
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <label className="font-medium text-sm" htmlFor="product">
                Producto
              </label>
              <Popover onOpenChange={setOpenProduct} open={openProduct}>
                <PopoverTrigger asChild>
                  <Button
                    aria-expanded={openProduct}
                    className="w-full justify-between"
                    disabled={
                      isLoadingProducts || availableProducts.length === 0
                    }
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
                    <CaretUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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
                              {selectedProductId === product.id ? (
                                <CheckIcon className="mr-2 h-4 w-4" size={16} />
                              ) : (
                                <div className="mr-2 h-4 w-4" />
                              )}
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
              <Label className="font-medium text-sm" htmlFor="quantity">
                Unidades
              </Label>
              <div className="space-y-1">
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
            <Frame className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-42">Producto</TableHead>
                    <TableHead className="w-24">Unidades</TableHead>
                    <TableHead className="w-24">Kg</TableHead>
                    <TableHead className="w-24">Precio</TableHead>
                    <TableHead className="w-24 text-right">Subtotal</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={`${item.product_id}-${index}`}>
                      <TableCell className="w-42 break-words font-medium">
                        <span className="break-words">{item.product_name}</span>
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8 w-20"
                          min="0"
                          onChange={(e) => {
                            const value = Number.parseFloat(e.target.value);
                            if (!Number.isNaN(value) && value >= 0) {
                              handleUpdateQuantity(index, value);
                            } else if (e.target.value === "") {
                              handleUpdateQuantity(index, 0);
                            }
                          }}
                          step="1"
                          type="number"
                          value={item.quantity}
                        />
                      </TableCell>
                      <TableCell>
                        {item.total_weight_kg !== undefined &&
                        item.total_weight_kg > 0 ? (
                          <span className="font-medium text-sm">
                            {formatWeight(item.total_weight_kg)} kg
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            -
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.total_weight_kg !== undefined &&
                        item.weight_per_unit ? (
                          <div className="flex items-center gap-1">
                            <span className="text-sm">$</span>
                            <Input
                              className="h-8 w-24"
                              min="0"
                              onChange={(e) => {
                                const value = Number.parseFloat(e.target.value);
                                if (!Number.isNaN(value) && value >= 0) {
                                  handleUpdatePricePerKg(index, value);
                                } else if (e.target.value === "") {
                                  handleUpdatePricePerKg(index, 0);
                                }
                              }}
                              placeholder="0.00"
                              step="0.01"
                              type="number"
                              value={item.price_per_kg || ""}
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="text-sm">$</span>
                            <Input
                              className="h-8 w-24"
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
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-medium">
                          ${formatCurrency(item.subtotal)}
                        </span>
                      </TableCell>
                      <TableCell className="w-8 text-right">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => onRemoveItem(index)}
                              size="sm"
                              variant="ghost"
                            >
                              <TrashIcon className="h-4 w-4" size={16} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Eliminar producto</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between p-2">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm">
                      Total kilogramos:
                    </span>
                    <span className="font-medium text-sm">
                      {(() => {
                        const totalKg = items.reduce(
                          (sum, item) => sum + (item.total_weight_kg ?? 0),
                          0
                        );
                        return totalKg > 0
                          ? `${formatWeight(totalKg)} kg`
                          : "-";
                      })()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-sm">
                    Subtotal:
                  </span>
                  <span className="font-semibold text-base">
                    $
                    {formatCurrency(
                      items.reduce((sum, item) => sum + item.subtotal, 0)
                    )}
                  </span>
                </div>
              </div>
            </Frame>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <PackageIcon
                  className="h-6 w-6 text-muted-foreground"
                  size={24}
                />
              </div>
              <p className="text-muted-foreground text-sm">
                No hay productos agregados. Seleccione un proveedor y agregue
                productos.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
