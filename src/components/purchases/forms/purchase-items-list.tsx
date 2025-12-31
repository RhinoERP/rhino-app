"use client";

import { CaretUpDownIcon, TrashIcon } from "@phosphor-icons/react";
import { Check, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Category } from "@/modules/categories/types";
import type { ProductWithPrice } from "@/modules/purchases/service/purchases.service";

export type PurchaseItem = {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_quantity?: number;
  unit_cost: number;
  subtotal: number;
  unit_of_measure: string;
  weight_per_unit?: number | null;
  total_weight_kg?: number;
  price_per_kg?: number;
  discount_percent?: number;
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

const calculateSubtotal = (params: {
  totalWeight: number | null;
  pricePerKg: number | undefined;
  quantity: number;
  unitCost: number;
  discountPercent?: number;
}): number => {
  const {
    totalWeight,
    pricePerKg,
    quantity,
    unitCost,
    discountPercent = 0,
  } = params;
  let gross: number;
  if (totalWeight && pricePerKg) {
    gross = totalWeight * pricePerKg;
  } else {
    gross = quantity * unitCost;
  }

  const discount = Math.min(
    Math.max(0, (discountPercent / 100) * gross),
    Math.max(0, gross)
  );

  return Math.max(0, gross - discount);
};

const buildPurchaseItem = (
  product: ProductWithPrice,
  quantity: number
): PurchaseItem | null => {
  const unitCost = product.cost_price ?? 0;
  const unitOfMeasure = product.unit_of_measure || "UN";
  const weightPerUnit = product.weight_per_unit;

  const isWeightOrVolume =
    unitOfMeasure === "KG" || unitOfMeasure === "LT" || unitOfMeasure === "MT";

  let unitQuantity: number;
  let totalWeight: number | null;

  if (isWeightOrVolume && weightPerUnit && weightPerUnit > 0) {
    unitQuantity = quantity * weightPerUnit;
    totalWeight = unitQuantity;
  } else {
    unitQuantity = quantity;
    totalWeight = null;
  }

  const pricePerKg = getPricePerKg(unitOfMeasure, product.cost_price);
  const subtotal = calculateSubtotal({
    totalWeight,
    pricePerKg,
    quantity,
    unitCost,
    discountPercent: 0,
  });

  if (!(product.id && product.name)) {
    return null;
  }

  return {
    product_id: product.id,
    product_name: product.name,
    quantity,
    unit_quantity: unitQuantity,
    unit_cost: unitCost,
    subtotal,
    unit_of_measure: unitOfMeasure,
    weight_per_unit: weightPerUnit,
    total_weight_kg: totalWeight ?? undefined,
    price_per_kg: pricePerKg,
    discount_percent: 0,
  };
};

type PurchaseItemsListProps = {
  products: ProductWithPrice[];
  items: PurchaseItem[];
  onAddItem: (item: PurchaseItem) => void;
  onUpdateItem: (index: number, item: PurchaseItem) => void;
  onRemoveItem: (index: number) => void;
  isLoadingProducts: boolean;
  categories?: Category[];
};

export function PurchaseItemsList({
  products,
  items,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  isLoadingProducts,
  categories = [],
}: PurchaseItemsListProps) {
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [quantity, setQuantity] = useState<number | string>("");
  const [openProduct, setOpenProduct] = useState(false);
  const [brandFilter, setBrandFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [isBrandFilterOpen, setIsBrandFilterOpen] = useState(false);
  const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  const brandOptions = useMemo(() => {
    const brands = new Set<string>();
    for (const product of products) {
      const brand = product.brand?.trim();
      if (brand) {
        brands.add(brand);
      }
    }
    return Array.from(brands).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const categoryOptions = useMemo(
    () =>
      categories
        .filter((cat) => products.some((p) => p.category_id === cat.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories, products]
  );

  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const normalizedBrand = product.brand?.trim() ?? "";

        if (brandFilter && normalizedBrand !== brandFilter) {
          return false;
        }

        if (categoryFilter && product.category_id !== categoryFilter) {
          return false;
        }

        return true;
      }),
    [brandFilter, categoryFilter, products]
  );

  const brandFilterLabel = useMemo(() => {
    if (!brandFilter) {
      return "Todas";
    }
    return brandOptions.find((brand) => brand === brandFilter) ?? "Todas";
  }, [brandFilter, brandOptions]);

  const categoryFilterLabel = useMemo(() => {
    if (!categoryFilter) {
      return "Todas";
    }
    return (
      categoryOptions.find((option) => option.id === categoryFilter)?.name ??
      "Todas"
    );
  }, [categoryFilter, categoryOptions]);

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

    const isWeightOrVolume =
      item.unit_of_measure === "KG" ||
      item.unit_of_measure === "LT" ||
      item.unit_of_measure === "MT";

    let unitQuantity: number;
    let totalWeight: number | null;

    if (isWeightOrVolume && item.weight_per_unit && item.weight_per_unit > 0) {
      unitQuantity = validatedQuantity * item.weight_per_unit;
      totalWeight = unitQuantity;
    } else {
      unitQuantity = validatedQuantity;
      totalWeight = null;
    }

    const subtotal = calculateSubtotal({
      totalWeight: totalWeight ?? null,
      pricePerKg: item.price_per_kg,
      quantity: validatedQuantity,
      unitCost: item.unit_cost,
      discountPercent: item.discount_percent ?? 0,
    });

    const updatedItem = {
      ...item,
      quantity: validatedQuantity,
      unit_quantity: unitQuantity,
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

    const pricePerKg =
      item.unit_of_measure === "KG" ? newCost : item.price_per_kg;

    const subtotal = calculateSubtotal({
      totalWeight: item.total_weight_kg ?? null,
      pricePerKg,
      quantity: item.quantity,
      unitCost: newCost,
      discountPercent: item.discount_percent ?? 0,
    });

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
      item.unit_of_measure === "KG" ? newPricePerKg : item.unit_cost;

    const subtotal = calculateSubtotal({
      totalWeight: item.total_weight_kg ?? null,
      pricePerKg: newPricePerKg,
      quantity: item.quantity,
      unitCost,
      discountPercent: item.discount_percent ?? 0,
    });

    const updatedItem = {
      ...item,
      unit_cost: unitCost,
      price_per_kg: newPricePerKg,
      subtotal,
    };

    onUpdateItem(index, updatedItem);
  };

  const handleUpdateDiscount = (index: number, discountPercent: number) => {
    const item = items[index];
    if (!item) {
      return;
    }

    const validatedDiscount = Math.min(Math.max(0, discountPercent), 100);
    const subtotal = calculateSubtotal({
      totalWeight: item.total_weight_kg ?? null,
      pricePerKg: item.price_per_kg,
      quantity: item.quantity,
      unitCost: item.unit_cost,
      discountPercent: validatedDiscount,
    });

    const updatedItem = {
      ...item,
      discount_percent: validatedDiscount,
      subtotal,
    };

    onUpdateItem(index, updatedItem);
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Function handles multiple unit types (KG, LT, MT)
  const handleUpdateTotalWeight = (index: number, measureValue: number) => {
    const item = items[index];
    if (!item) {
      return;
    }

    const validatedMeasure = Math.max(0, measureValue);
    const isWeightOrVolume =
      item.unit_of_measure === "KG" ||
      item.unit_of_measure === "LT" ||
      item.unit_of_measure === "MT";

    if (isWeightOrVolume && item.weight_per_unit && item.weight_per_unit > 0) {
      const unitQuantity = validatedMeasure;
      const calculatedQuantity = validatedMeasure / item.weight_per_unit;
      const itemQuantity = Math.max(1, calculatedQuantity);

      // Para KG, usamos total_weight_kg; para LT/MT, usamos unit_quantity
      const totalWeight =
        item.unit_of_measure === "KG" ? validatedMeasure : null;
      const pricePerKg = item.price_per_kg ?? item.unit_cost;

      const subtotal = calculateSubtotal({
        totalWeight,
        pricePerKg,
        quantity: itemQuantity,
        unitCost: item.unit_cost,
        discountPercent: item.discount_percent ?? 0,
      });

      const updatedItem = {
        ...item,
        quantity: itemQuantity,
        unit_quantity: unitQuantity,
        total_weight_kg:
          item.unit_of_measure === "KG"
            ? validatedMeasure
            : item.total_weight_kg,
        subtotal,
      };

      onUpdateItem(index, updatedItem);
    } else {
      const subtotal = calculateSubtotal({
        totalWeight: null,
        pricePerKg: item.price_per_kg,
        quantity: item.quantity,
        unitCost: item.unit_cost,
        discountPercent: item.discount_percent ?? 0,
      });

      const updatedItem = {
        ...item,
        total_weight_kg: validatedMeasure || undefined,
        subtotal,
      };

      onUpdateItem(index, updatedItem);
    }
  };

  const availableProducts = filteredProducts.filter(
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
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="brandFilter">Marca</Label>
                <Popover
                  onOpenChange={setIsBrandFilterOpen}
                  open={isBrandFilterOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      aria-expanded={isBrandFilterOpen}
                      className="w-full justify-between text-left font-normal"
                      id="brandFilter"
                      role="combobox"
                      variant="outline"
                    >
                      <span className="truncate">
                        {brandFilterLabel || "Todas"}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-[280px] max-w-[90vw] p-0"
                    sideOffset={8}
                  >
                    <Command>
                      <CommandInput placeholder="Buscar marca..." />
                      <CommandList>
                        <CommandEmpty>Sin resultados.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            key="all"
                            onSelect={() => {
                              setBrandFilter("");
                              setIsBrandFilterOpen(false);
                            }}
                            value="Todas"
                          >
                            <span className="flex-1 truncate">Todas</span>
                            <Check
                              className={cn(
                                "h-4 w-4 shrink-0 text-primary transition-opacity",
                                brandFilter ? "opacity-0" : "opacity-100"
                              )}
                            />
                          </CommandItem>
                          {brandOptions.map((brand) => (
                            <CommandItem
                              key={brand}
                              onSelect={() => {
                                setBrandFilter(brand);
                                setIsBrandFilterOpen(false);
                              }}
                              value={brand}
                            >
                              <span className="flex-1 truncate">{brand}</span>
                              <Check
                                className={cn(
                                  "h-4 w-4 shrink-0 text-primary transition-opacity",
                                  brandFilter === brand
                                    ? "opacity-100"
                                    : "opacity-0"
                                )}
                              />
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="categoryFilter">Categoría</Label>
                <Popover
                  onOpenChange={setIsCategoryFilterOpen}
                  open={isCategoryFilterOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      aria-expanded={isCategoryFilterOpen}
                      className="w-full justify-between text-left font-normal"
                      id="categoryFilter"
                      role="combobox"
                      variant="outline"
                    >
                      <span className="truncate">
                        {categoryFilterLabel || "Todas"}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-[280px] max-w-[90vw] p-0"
                    sideOffset={8}
                  >
                    <Command>
                      <CommandInput placeholder="Buscar categoría..." />
                      <CommandList>
                        <CommandEmpty>Sin resultados.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            key="all"
                            onSelect={() => {
                              setCategoryFilter("");
                              setIsCategoryFilterOpen(false);
                            }}
                            value="Todas"
                          >
                            <span className="flex-1 truncate">Todas</span>
                            <Check
                              className={cn(
                                "h-4 w-4 shrink-0 text-primary transition-opacity",
                                categoryFilter ? "opacity-0" : "opacity-100"
                              )}
                            />
                          </CommandItem>
                          {categoryOptions.map((category) => (
                            <CommandItem
                              key={category.id}
                              onSelect={() => {
                                setCategoryFilter(category.id);
                                setIsCategoryFilterOpen(false);
                              }}
                              value={category.name}
                            >
                              <span className="flex-1 truncate">
                                {category.name}
                              </span>
                              <Check
                                className={cn(
                                  "h-4 w-4 shrink-0 text-primary transition-opacity",
                                  categoryFilter === category.id
                                    ? "opacity-100"
                                    : "opacity-0"
                                )}
                              />
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

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
                            {formatCurrency(selectedProduct.cost_price ?? 0)}
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
                      <CommandInput placeholder="Buscar producto por nombre o SKU..." />
                      <CommandList>
                        <CommandEmpty>
                          No se encontraron productos para los filtros
                          aplicados.
                        </CommandEmpty>
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
                                value={`${product.name} ${product.sku}`}
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
          </div>
          {items.length === 0 ? (
            <div className="rounded-lg border">
              <Empty>
                <EmptyContent>
                  <EmptyTitle>Sin productos agregados</EmptyTitle>
                  <EmptyDescription>
                    Selecciona un producto y cantidad para sumarlo a la compra.
                  </EmptyDescription>
                </EmptyContent>
              </Empty>
            </div>
          ) : (
            <div className="rounded-lg border">
              <div className="divide-y">
                {/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: UI form composition requires several conditionals */}
                {items.map((item, index) => {
                  const product = products.find(
                    (p) => p.id === item.product_id
                  );
                  const unitOfMeasure = item.unit_of_measure || "UN";
                  const unitOfMeasureLabels: Record<string, string> = {
                    UN: "unidad",
                    KG: "kg",
                    LT: "lt",
                    MT: "m",
                  };
                  const unitLabel =
                    unitOfMeasureLabels[unitOfMeasure] || unitOfMeasure;

                  const itemIsWeightOrVolume =
                    item.unit_of_measure === "KG" ||
                    item.unit_of_measure === "LT" ||
                    item.unit_of_measure === "MT";

                  const canEditMeasure =
                    itemIsWeightOrVolume &&
                    product?.weight_per_unit &&
                    product.weight_per_unit > 0;

                  let measureLabel = "Medida";
                  if (itemIsWeightOrVolume) {
                    if (unitOfMeasure === "KG") {
                      measureLabel = "Peso (kg)";
                    } else if (unitOfMeasure === "LT") {
                      measureLabel = "Volumen (lt)";
                    } else if (unitOfMeasure === "MT") {
                      measureLabel = "Longitud (m)";
                    }
                  }

                  let measureValue: number | undefined;
                  if (itemIsWeightOrVolume) {
                    if (unitOfMeasure === "KG") {
                      measureValue = item.total_weight_kg;
                    } else {
                      measureValue = item.unit_quantity;
                    }
                  }

                  return (
                    <div
                      className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,_2fr)_80px_100px_100px_80px_120px_auto] sm:items-center"
                      key={`${item.product_id}-${index}`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{item.product_name}</p>
                          {product?.brand ? (
                            <span className="text-muted-foreground text-xs">
                              {product.brand}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-muted-foreground text-sm">
                          SKU {product?.sku ?? "N/A"}
                        </p>
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs">
                          Cantidad
                        </span>
                        <Input
                          className="h-8 w-full"
                          inputMode="decimal"
                          min={0}
                          onChange={(event) => {
                            const value = Number.parseFloat(event.target.value);
                            if (!Number.isNaN(value) && value >= 0) {
                              handleUpdateQuantity(index, value);
                            } else if (event.target.value === "") {
                              handleUpdateQuantity(index, 0);
                            }
                          }}
                          step="0.01"
                          type="number"
                          value={
                            Number.isNaN(item.quantity) ? "" : item.quantity
                          }
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs">
                          {measureLabel}
                        </span>
                        {canEditMeasure ? (
                          <Input
                            className="h-8 w-full"
                            inputMode="decimal"
                            min={0}
                            onChange={(event) => {
                              const value = Number.parseFloat(
                                event.target.value
                              );
                              if (!Number.isNaN(value) && value >= 0) {
                                handleUpdateTotalWeight(index, value);
                              } else if (event.target.value === "") {
                                handleUpdateTotalWeight(index, 0);
                              }
                            }}
                            step="0.01"
                            type="number"
                            value={
                              Number.isNaN(measureValue) ||
                              measureValue === undefined
                                ? ""
                                : measureValue
                            }
                          />
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            {unitLabel}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs">
                          Precio
                        </span>
                        {itemIsWeightOrVolume && canEditMeasure ? (
                          <div className="flex items-center gap-1">
                            <span className="text-sm">$</span>
                            <Input
                              className="h-8 w-20"
                              min={0}
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
                              className="h-8 w-20"
                              min={0}
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
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs">
                          Descuento %
                        </span>
                        <Input
                          className="h-8 w-full"
                          inputMode="decimal"
                          max={100}
                          min={0}
                          onChange={(event) => {
                            const value = Number.parseFloat(event.target.value);
                            if (!Number.isNaN(value) && value >= 0) {
                              handleUpdateDiscount(index, value);
                            } else if (event.target.value === "") {
                              handleUpdateDiscount(index, 0);
                            }
                          }}
                          step="0.01"
                          type="number"
                          value={
                            Number.isNaN(item.discount_percent) ||
                            item.discount_percent === 0
                              ? ""
                              : item.discount_percent
                          }
                        />
                      </div>

                      <div className="flex flex-col items-start gap-1 sm:items-end">
                        <span className="text-muted-foreground text-xs">
                          Subtotal
                        </span>
                        <p className="font-medium">
                          {formatCurrency(item.subtotal)}
                        </p>
                      </div>

                      <div className="flex items-center justify-start sm:justify-end">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              aria-label="Eliminar producto"
                              className="hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => onRemoveItem(index)}
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Eliminar producto</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
