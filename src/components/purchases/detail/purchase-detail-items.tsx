"use client";

import { XCircleIcon } from "@phosphor-icons/react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
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
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProductWithPrice } from "@/modules/purchases/service/purchases.service";

type PurchaseDetailItemRowProps = {
  item: PurchaseDetailItem;
  isEditingDetails: boolean;
  onQuantityChange: (id: string | undefined, value: string) => void;
  onUnitCostChange: (id: string | undefined, value: string) => void;
  onPricePerKgChange: (id: string | undefined, value: string) => void;
  onRemove: (id: string | undefined) => void;
};

function PurchaseDetailItemRow({
  item,
  isEditingDetails,
  onQuantityChange,
  onUnitCostChange,
  onPricePerKgChange,
  onRemove,
}: PurchaseDetailItemRowProps) {
  const renderPriceCell = () => {
    if (isEditingDetails) {
      const hasWeight =
        item.total_weight_kg !== undefined && item.weight_per_unit;
      if (hasWeight) {
        return (
          <div className="flex items-center gap-1">
            <span className="text-sm">$</span>
            <Input
              className="h-8 w-24"
              min={0}
              onChange={(e) => {
                const value = Number.parseFloat(e.target.value);
                if (!Number.isNaN(value) && value >= 0) {
                  onPricePerKgChange(item.id, e.target.value);
                } else if (e.target.value === "") {
                  onPricePerKgChange(item.id, "0");
                }
              }}
              placeholder="0.00"
              step="0.01"
              type="number"
              value={item.price_per_kg || ""}
            />
          </div>
        );
      }
      return (
        <div className="flex items-center gap-1">
          <span className="text-sm">$</span>
          <Input
            className="h-8 w-24"
            min={0}
            onChange={(e) => {
              const value = Number.parseFloat(e.target.value);
              if (!Number.isNaN(value)) {
                onUnitCostChange(item.id, e.target.value);
              } else if (e.target.value === "") {
                onUnitCostChange(item.id, "0");
              }
            }}
            placeholder="0.00"
            step="0.01"
            type="number"
            value={item.unit_cost || ""}
          />
        </div>
      );
    }

    const hasWeight =
      item.total_weight_kg !== undefined && item.weight_per_unit;
    if (hasWeight) {
      return formatCurrency(item.price_per_kg ?? item.unit_cost);
    }
    return formatCurrency(item.unit_cost);
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{item.product_name}</TableCell>
      <TableCell>
        {isEditingDetails ? (
          <Input
            className="h-8 w-20"
            min={0}
            onChange={(e) => {
              const value = Number.parseFloat(e.target.value);
              if (!Number.isNaN(value) && value >= 0) {
                onQuantityChange(item.id, e.target.value);
              } else if (e.target.value === "") {
                onQuantityChange(item.id, "0");
              }
            }}
            step="0.01"
            type="number"
            value={item.unit_quantity}
          />
        ) : (
          item.quantity
        )}
      </TableCell>
      <TableCell>
        {(() => {
          const isWeightOrVolume =
            item.unit_of_measure === "KG" ||
            item.unit_of_measure === "LT" ||
            item.unit_of_measure === "MT";

          if (
            item.unit_quantity != null &&
            item.unit_quantity > 0 &&
            isWeightOrVolume
          ) {
            let unitLabel = "kg";
            if (item.unit_of_measure === "LT") {
              unitLabel = "lt";
            } else if (item.unit_of_measure === "MT") {
              unitLabel = "mt";
            }

            return (
              <span className="font-medium text-sm">
                {formatWeight(item.unit_quantity)} {unitLabel}
              </span>
            );
          }

          return <span className="text-muted-foreground text-sm">-</span>;
        })()}
      </TableCell>
      <TableCell>{renderPriceCell()}</TableCell>
      <TableCell className="text-right">
        {formatCurrency(item.subtotal)}
      </TableCell>
      {isEditingDetails && (
        <TableCell>
          <Button
            onClick={() => onRemove(item.id)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <XCircleIcon className="h-4 w-4" />
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
}

const formatWeight = (weight: number | null): string => {
  if (weight === null || weight === 0) {
    return "";
  }
  return weight.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const getPricePerKg = (
  unitOfMeasure: string | null | undefined,
  costPrice: number | null | undefined
): number | undefined => {
  if (unitOfMeasure === "KG" && costPrice != null) {
    return costPrice;
  }
  return;
};

export type PurchaseDetailItem = {
  id?: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_quantity: number;
  unit_cost: number;
  subtotal: number;
  unit_of_measure?: string;
  weight_per_unit?: number | null;
  total_weight_kg?: number | null;
  price_per_kg?: number;
};

type PurchaseDetailItemsProps = {
  items: PurchaseDetailItem[];
  products: ProductWithPrice[];
  supplierId: string;
  isEditingDetails: boolean;
  onItemsChange: (items: PurchaseDetailItem[]) => void;
  onError: (error: string | null) => void;
};

export function PurchaseDetailItems({
  items,
  products,
  supplierId,
  isEditingDetails,
  onItemsChange,
  onError,
}: PurchaseDetailItemsProps) {
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedQuantity, setSelectedQuantity] = useState<number>(1);
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);

  const filteredProducts = products.filter((p) => p.supplier_id === supplierId);
  const selectedProduct = products.find((p) => p.id === selectedProductId);

  const calculateQuantityFromUnitQuantity = (
    unitQuantity: number,
    unitOfMeasure: string | undefined,
    weightPerUnit: number | null | undefined
  ) => {
    const isWeightOrVolume =
      unitOfMeasure === "KG" ||
      unitOfMeasure === "LT" ||
      unitOfMeasure === "MT";

    if (isWeightOrVolume && weightPerUnit && weightPerUnit > 0) {
      const calculated = unitQuantity / weightPerUnit;
      return Math.max(1, calculated);
    }
    return Math.max(1, unitQuantity);
  };

  const updateItemQuantity = (
    item: PurchaseDetailItem,
    unitQuantity: number
  ): PurchaseDetailItem => {
    const itemQuantity = calculateQuantityFromUnitQuantity(
      unitQuantity,
      item.unit_of_measure,
      item.weight_per_unit
    );

    const isWeightOrVolume =
      item.unit_of_measure === "KG" ||
      item.unit_of_measure === "LT" ||
      item.unit_of_measure === "MT";
    const totalWeight =
      isWeightOrVolume && item.weight_per_unit ? unitQuantity : null;

    const pricePerKg = item.price_per_kg ?? item.unit_cost;
    const isWeightOrVolumeForSubtotal =
      item.unit_of_measure === "KG" ||
      item.unit_of_measure === "LT" ||
      item.unit_of_measure === "MT";
    const subtotal =
      isWeightOrVolumeForSubtotal && pricePerKg
        ? unitQuantity * pricePerKg
        : itemQuantity * item.unit_cost;

    return {
      ...item,
      quantity: itemQuantity,
      unit_quantity: unitQuantity,
      total_weight_kg: totalWeight ?? undefined,
      subtotal,
    };
  };

  const handleQuantityChange = (id: string | undefined, value: string) => {
    if (!id) {
      return;
    }
    const parsed = Number.parseFloat(value);
    const unitQuantity = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
    onItemsChange(
      items.map((item) => {
        if (item.id !== id) {
          return item;
        }
        return updateItemQuantity(item, unitQuantity);
      })
    );
  };

  const handleUnitCostChange = (id: string | undefined, value: string) => {
    if (!id) {
      return;
    }
    const parsed = Number.parseFloat(value);
    const unitCost = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
    onItemsChange(
      items.map((item) => {
        if (item.id === id) {
          const pricePerKg =
            item.unit_of_measure === "KG" ? unitCost : item.price_per_kg;
          const subtotal =
            item.total_weight_kg && pricePerKg
              ? item.total_weight_kg * pricePerKg
              : item.unit_quantity * unitCost;
          return {
            ...item,
            unit_cost: unitCost,
            price_per_kg: pricePerKg,
            subtotal,
          };
        }
        return item;
      })
    );
  };

  const handlePricePerKgChange = (id: string | undefined, value: string) => {
    if (!id) {
      return;
    }
    const parsed = Number.parseFloat(value);
    const pricePerKg = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
    onItemsChange(
      items.map((item) => {
        if (item.id === id) {
          const unitCost =
            item.unit_of_measure === "KG" ? pricePerKg : item.unit_cost;
          const subtotal = item.total_weight_kg
            ? item.total_weight_kg * pricePerKg
            : item.unit_quantity * unitCost;
          return {
            ...item,
            unit_cost: unitCost,
            price_per_kg: pricePerKg,
            subtotal,
          };
        }
        return item;
      })
    );
  };

  const validateProductSelection = (): string | null => {
    if (!selectedProductId) {
      return "Selecciona un producto para agregarlo";
    }
    if (!selectedQuantity || selectedQuantity <= 0) {
      return "La cantidad debe ser mayor a 0";
    }
    return null;
  };

  const calculateItemQuantities = (
    selectedQty: number,
    unitOfMeasure: string,
    weightPerUnit: number | null | undefined
  ) => {
    const isWeightOrVolume =
      unitOfMeasure === "KG" ||
      unitOfMeasure === "LT" ||
      unitOfMeasure === "MT";

    if (isWeightOrVolume && weightPerUnit && weightPerUnit > 0) {
      const calculatedQuantity = selectedQty / weightPerUnit;
      return {
        itemQuantity: Math.max(1, calculatedQuantity),
        itemUnitQuantity: selectedQty,
        itemTotalWeight: selectedQty,
      };
    }

    return {
      itemQuantity: Math.max(1, selectedQty),
      itemUnitQuantity: selectedQty,
      itemTotalWeight: null,
    };
  };

  const calculateItemData = (
    product: ProductWithPrice,
    selectedQty: number
  ): PurchaseDetailItem | null => {
    if (!(product.id && product.name)) {
      return null;
    }

    const unitCost = product.cost_price ?? 0;
    const unitOfMeasure = product.unit_of_measure || "UN";
    const weightPerUnit = product.weight_per_unit;

    const { itemQuantity, itemUnitQuantity, itemTotalWeight } =
      calculateItemQuantities(selectedQty, unitOfMeasure, weightPerUnit);

    const isWeightOrVolume =
      unitOfMeasure === "KG" ||
      unitOfMeasure === "LT" ||
      unitOfMeasure === "MT";
    const pricePerKg = getPricePerKg(unitOfMeasure, unitCost);
    const subtotal =
      itemTotalWeight && pricePerKg && isWeightOrVolume
        ? itemTotalWeight * pricePerKg
        : itemQuantity * unitCost;

    return {
      product_id: product.id,
      product_name: product.name,
      quantity: itemQuantity,
      unit_quantity: itemUnitQuantity,
      unit_cost: unitCost,
      subtotal,
      unit_of_measure: unitOfMeasure,
      weight_per_unit: weightPerUnit,
      total_weight_kg: itemTotalWeight ?? undefined,
      price_per_kg: pricePerKg,
    };
  };

  const handleAddProduct = () => {
    const validationError = validateProductSelection();
    if (validationError) {
      onError(validationError);
      return;
    }

    const product = products.find((p) => p.id === selectedProductId);
    if (!product) {
      onError("Producto no encontrado");
      return;
    }

    const newItem = calculateItemData(product, selectedQuantity);
    if (!newItem) {
      onError("Error al crear el item del producto");
      return;
    }

    onItemsChange([...items, newItem]);

    setSelectedProductId("");
    setSelectedQuantity(1);
    onError(null);
  };

  const handleRemoveItem = (id: string | undefined) => {
    if (!id) {
      return;
    }
    onItemsChange(items.filter((item) => item.id !== id));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Productos de la compra</CardTitle>
        <CardDescription>
          {isEditingDetails
            ? "Puedes agregar, editar o eliminar productos. En modo edición también puedes ajustar cantidades y precios."
            : "Lista de productos de la orden de compra."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isEditingDetails && (
          <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,_2fr)_140px_auto] md:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="product">Producto</Label>
                <Popover
                  onOpenChange={setIsProductPickerOpen}
                  open={isProductPickerOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      aria-expanded={isProductPickerOpen}
                      className="w-full justify-between text-left font-normal"
                      id="product"
                      role="combobox"
                      variant="outline"
                    >
                      {selectedProduct ? (
                        <div className="flex flex-1 flex-col text-left leading-tight">
                          <span className="truncate font-medium">
                            {selectedProduct.name}
                          </span>
                          <span className="truncate text-muted-foreground text-xs">
                            {selectedProduct.sku} ·{" "}
                            {formatCurrency(selectedProduct.cost_price ?? 0)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">
                          Selecciona un producto
                        </span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-[520px] max-w-[90vw] p-0"
                    sideOffset={8}
                  >
                    <Command>
                      <CommandInput placeholder="Buscar producto por nombre o SKU..." />
                      <CommandList>
                        <CommandEmpty>
                          No se encontraron productos para este proveedor.
                        </CommandEmpty>
                        <CommandGroup>
                          {filteredProducts.map((product) => (
                            <CommandItem
                              key={product.id}
                              onSelect={() => {
                                if (product.id) {
                                  setSelectedProductId(product.id);
                                  setIsProductPickerOpen(false);
                                }
                              }}
                              value={`${product.name} ${product.sku}`}
                            >
                              <div className="flex w-full items-start gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-medium">
                                    {product.name}
                                  </p>
                                  <p className="text-muted-foreground text-xs">
                                    {product.sku} ·{" "}
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

              <div className="space-y-1.5">
                <Label htmlFor="quantity">Cantidad</Label>
                <Input
                  id="quantity"
                  inputMode="decimal"
                  min={0}
                  onChange={(event) => {
                    const parsed = Number.parseFloat(event.target.value);
                    setSelectedQuantity(Number.isNaN(parsed) ? 0 : parsed);
                  }}
                  step="0.01"
                  type="number"
                  value={Number.isNaN(selectedQuantity) ? "" : selectedQuantity}
                />
              </div>

              <div className="flex items-end">
                <Button
                  className="w-full md:w-auto"
                  onClick={handleAddProduct}
                  type="button"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-lg border">
          {items.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No hay productos cargados en esta compra.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="w-24">Unidades</TableHead>
                  <TableHead className="w-24">Medida</TableHead>
                  <TableHead className="w-24">Precio</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  {isEditingDetails && <TableHead className="w-[50px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <PurchaseDetailItemRow
                    isEditingDetails={isEditingDetails}
                    item={item}
                    key={item.id ?? item.product_id}
                    onPricePerKgChange={handlePricePerKgChange}
                    onQuantityChange={handleQuantityChange}
                    onRemove={handleRemoveItem}
                    onUnitCostChange={handleUnitCostChange}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
