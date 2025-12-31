"use client";

import { CaretUpDownIcon } from "@phosphor-icons/react";
import { Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Category } from "@/modules/categories/types";
import type { ProductWithPrice } from "@/modules/purchases/service/purchases.service";

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
  discount_percent?: number;
};

type InputUnit = "PALLETS" | "BOXES" | "UNITS";

const convertToBaseUnits = (
  quantity: number,
  unit: InputUnit,
  product: ProductWithPrice
): number => {
  if (unit === "UNITS") {
    return quantity;
  }

  if (unit === "BOXES") {
    const unitsPerBox = product.units_per_box;
    if (!unitsPerBox || unitsPerBox <= 0) {
      return quantity;
    }
    return quantity * unitsPerBox;
  }

  if (unit === "PALLETS") {
    const boxesPerPallet = product.boxes_per_pallet;
    const unitsPerBox = product.units_per_box;
    if (!boxesPerPallet || boxesPerPallet <= 0) {
      return quantity;
    }
    if (!unitsPerBox || unitsPerBox <= 0) {
      return quantity * boxesPerPallet;
    }
    return quantity * boxesPerPallet * unitsPerBox;
  }

  return quantity;
};

const getAvailableUnits = (
  product: ProductWithPrice | undefined
): InputUnit[] => {
  if (!product) {
    return ["UNITS"];
  }

  const units: InputUnit[] = ["UNITS"];

  if (product.units_per_box && product.units_per_box > 0) {
    units.push("BOXES");
  }

  if (product.boxes_per_pallet && product.boxes_per_pallet > 0) {
    units.push("PALLETS");
  }

  return units;
};

const getUnitLabel = (unit: InputUnit): string => {
  switch (unit) {
    case "PALLETS":
      return "Pallets";
    case "BOXES":
      return "Cajas";
    case "UNITS":
      return "Unidades";
    default:
      return "Unidades";
  }
};

type PurchaseDetailItemsProps = {
  items: PurchaseDetailItem[];
  products: ProductWithPrice[];
  supplierId: string;
  isEditingDetails: boolean;
  onItemsChange: (items: PurchaseDetailItem[]) => void;
  onError: (error: string | null) => void;
  categories?: Category[];
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Component handles multiple unit types, conversions, and complex state management
export function PurchaseDetailItems({
  items,
  products,
  supplierId,
  isEditingDetails,
  onItemsChange,
  onError,
  categories = [],
}: PurchaseDetailItemsProps) {
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedQuantity, setSelectedQuantity] = useState<number>(1);
  const [inputUnit, setInputUnit] = useState<InputUnit>("UNITS");
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [brandFilter, setBrandFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [isBrandFilterOpen, setIsBrandFilterOpen] = useState(false);
  const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const availableUnits = useMemo(
    () => getAvailableUnits(selectedProduct),
    [selectedProduct]
  );

  useEffect(() => {
    if (selectedProduct && !availableUnits.includes(inputUnit)) {
      setInputUnit(availableUnits[0] ?? "UNITS");
    }
  }, [selectedProduct, availableUnits, inputUnit]);

  const baseFilteredProducts = products.filter(
    (p) => p.supplier_id === supplierId
  );

  const brandOptions = useMemo(() => {
    const brands = new Set<string>();
    for (const product of baseFilteredProducts) {
      const brand = product.brand?.trim();
      if (brand) {
        brands.add(brand);
      }
    }
    return Array.from(brands).sort((a, b) => a.localeCompare(b));
  }, [baseFilteredProducts]);

  const categoryOptions = useMemo(
    () =>
      categories
        .filter((cat) =>
          baseFilteredProducts.some((p) => p.category_id === cat.id)
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories, baseFilteredProducts]
  );

  const filteredProducts = useMemo(
    () =>
      baseFilteredProducts.filter((product) => {
        const normalizedBrand = product.brand?.trim() ?? "";

        if (brandFilter && normalizedBrand !== brandFilter) {
          return false;
        }

        if (categoryFilter && product.category_id !== categoryFilter) {
          return false;
        }

        return true;
      }),
    [brandFilter, categoryFilter, baseFilteredProducts]
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
    let gross: number;
    if (isWeightOrVolumeForSubtotal && pricePerKg) {
      gross = unitQuantity * pricePerKg;
    } else {
      gross = itemQuantity * item.unit_cost;
    }

    const discountPercent = item.discount_percent ?? 0;
    const discount = Math.min(
      Math.max(0, (discountPercent / 100) * gross),
      Math.max(0, gross)
    );
    const subtotal = Math.max(0, gross - discount);

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
          let gross: number;
          if (item.total_weight_kg && pricePerKg) {
            gross = item.total_weight_kg * pricePerKg;
          } else {
            gross = item.unit_quantity * unitCost;
          }
          const discountPercent = item.discount_percent ?? 0;
          const discount = Math.min(
            Math.max(0, (discountPercent / 100) * gross),
            Math.max(0, gross)
          );
          const subtotal = Math.max(0, gross - discount);
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
          let gross: number;
          if (item.total_weight_kg) {
            gross = item.total_weight_kg * pricePerKg;
          } else {
            gross = item.unit_quantity * unitCost;
          }
          const discountPercent = item.discount_percent ?? 0;
          const discount = Math.min(
            Math.max(0, (discountPercent / 100) * gross),
            Math.max(0, gross)
          );
          const subtotal = Math.max(0, gross - discount);
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
    selectedQty: number,
    inputUnitParam: InputUnit = "UNITS"
  ): PurchaseDetailItem | null => {
    if (!(product.id && product.name)) {
      return null;
    }

    // Convertir la cantidad ingresada a unidades base
    const baseQuantity = convertToBaseUnits(
      selectedQty,
      inputUnitParam,
      product
    );

    const unitCost = product.cost_price ?? 0;
    const unitOfMeasure = product.unit_of_measure || "UN";
    const weightPerUnit = product.weight_per_unit;

    const { itemQuantity, itemUnitQuantity, itemTotalWeight } =
      calculateItemQuantities(baseQuantity, unitOfMeasure, weightPerUnit);

    const isWeightOrVolume =
      unitOfMeasure === "KG" ||
      unitOfMeasure === "LT" ||
      unitOfMeasure === "MT";
    const pricePerKg = getPricePerKg(unitOfMeasure, unitCost);
    let gross: number;
    if (itemTotalWeight && pricePerKg && isWeightOrVolume) {
      gross = itemTotalWeight * pricePerKg;
    } else {
      gross = itemQuantity * unitCost;
    }
    const subtotal = gross;

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
      discount_percent: 0,
    };
  };

  const handleDiscountChange = (id: string | undefined, value: string) => {
    if (!id) {
      return;
    }
    const parsed = Number.parseFloat(value);
    const discountPercent = Number.isNaN(parsed)
      ? 0
      : Math.min(Math.max(0, parsed), 100);
    onItemsChange(
      items.map((item) => {
        if (item.id !== id) {
          return item;
        }
        const pricePerKg = item.price_per_kg ?? item.unit_cost;
        const isWeightOrVolume =
          item.unit_of_measure === "KG" ||
          item.unit_of_measure === "LT" ||
          item.unit_of_measure === "MT";
        let gross: number;
        if (item.total_weight_kg && pricePerKg && isWeightOrVolume) {
          gross = item.total_weight_kg * pricePerKg;
        } else {
          gross = item.unit_quantity * item.unit_cost;
        }
        const discount = Math.min(
          Math.max(0, (discountPercent / 100) * gross),
          Math.max(0, gross)
        );
        const subtotal = Math.max(0, gross - discount);
        return {
          ...item,
          discount_percent: discountPercent,
          subtotal,
        };
      })
    );
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

    const newItem = calculateItemData(product, selectedQuantity, inputUnit);
    if (!newItem) {
      onError("Error al crear el item del producto");
      return;
    }

    onItemsChange([...items, newItem]);

    setSelectedProductId("");
    setSelectedQuantity(1);
    setInputUnit("UNITS");
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
      <CardContent>
        <div className="space-y-6">
          {isEditingDetails && (
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
                  <Popover
                    onOpenChange={setIsProductPickerOpen}
                    open={isProductPickerOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        aria-expanded={isProductPickerOpen}
                        className="w-full justify-between"
                        disabled={filteredProducts.length === 0}
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
                            {filteredProducts.length === 0
                              ? "No hay productos disponibles"
                              : "Seleccione un producto"}
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
                            {filteredProducts
                              .filter((product) => product.id)
                              .map((product) => (
                                <CommandItem
                                  key={product.id}
                                  onSelect={() => {
                                    setSelectedProductId(product.id ?? "");
                                    setIsProductPickerOpen(false);
                                  }}
                                  value={`${product.name} ${product.sku}`}
                                >
                                  <div className="flex w-full items-start gap-3">
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate font-medium">
                                        {product.name}
                                      </p>
                                      <p className="text-muted-foreground text-xs">
                                        {product.sku} · $
                                        {formatCurrency(
                                          product.cost_price ?? 0
                                        )}
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

                {selectedProduct && availableUnits.length > 1 && (
                  <div className="w-full space-y-2 sm:w-32">
                    <Label className="font-medium text-sm" htmlFor="inputUnit">
                      Unidad
                    </Label>
                    <Select
                      onValueChange={(value) =>
                        setInputUnit(value as InputUnit)
                      }
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

                <div className="w-full space-y-2 sm:w-32">
                  <Label className="font-medium text-sm" htmlFor="quantity">
                    {selectedProduct ? getUnitLabel(inputUnit) : "Cantidad"}
                  </Label>
                  <div className="space-y-1">
                    <Input
                      id="quantity"
                      min="0.01"
                      onChange={(e) => {
                        const parsed = Number.parseFloat(e.target.value);
                        setSelectedQuantity(Number.isNaN(parsed) ? 0 : parsed);
                      }}
                      placeholder="0"
                      step="0.01"
                      type="number"
                      value={
                        Number.isNaN(selectedQuantity) ? "" : selectedQuantity
                      }
                    />
                  </div>
                </div>

                <Button
                  className="sm:mb-0"
                  disabled={!selectedProductId || selectedQuantity <= 0}
                  onClick={handleAddProduct}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar
                </Button>
              </div>
            </div>
          )}

          {items.length === 0 ? (
            <div className="rounded-lg border">
              <Empty>
                <EmptyContent>
                  <EmptyTitle>Sin productos agregados</EmptyTitle>
                  <EmptyDescription>
                    {isEditingDetails
                      ? "Selecciona un producto y cantidad para sumarlo a la compra."
                      : "No hay productos cargados en esta compra."}
                  </EmptyDescription>
                </EmptyContent>
              </Empty>
            </div>
          ) : (
            <div className="rounded-lg border">
              <div className="divide-y">
                {/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: UI form composition requires several conditionals */}
                {items.map((item) => {
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
                      measureValue = item.total_weight_kg ?? undefined;
                    } else {
                      measureValue = item.unit_quantity;
                    }
                  }

                  return (
                    <div
                      className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,_2fr)_80px_100px_100px_80px_120px_auto] sm:items-center"
                      key={item.id ?? item.product_id}
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
                          {product?.sku ?? "N/A"}
                        </p>
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs">
                          Cantidad
                        </span>
                        {isEditingDetails ? (
                          <Input
                            className="h-8 w-full"
                            inputMode="decimal"
                            min={0}
                            onChange={(event) => {
                              const value = Number.parseFloat(
                                event.target.value
                              );
                              if (!Number.isNaN(value) && value >= 0) {
                                handleQuantityChange(
                                  item.id,
                                  event.target.value
                                );
                              } else if (event.target.value === "") {
                                handleQuantityChange(item.id, "0");
                              }
                            }}
                            step="0.01"
                            type="number"
                            value={item.unit_quantity ?? ""}
                          />
                        ) : (
                          <p className="text-sm">{item.quantity}</p>
                        )}
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs">
                          {measureLabel}
                        </span>
                        {isEditingDetails && canEditMeasure ? (
                          <Input
                            className="h-8 w-full"
                            inputMode="decimal"
                            min={0}
                            onChange={(event) => {
                              const value = Number.parseFloat(
                                event.target.value
                              );
                              if (!Number.isNaN(value) && value >= 0) {
                                handleQuantityChange(item.id, value.toString());
                              } else if (event.target.value === "") {
                                handleQuantityChange(item.id, "0");
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
                            {(() => {
                              if (
                                measureValue !== undefined &&
                                measureValue > 0
                              ) {
                                let unit = "kg";
                                if (unitOfMeasure === "LT") {
                                  unit = "lt";
                                } else if (unitOfMeasure === "MT") {
                                  unit = "m";
                                }
                                return `${measureValue.toLocaleString("es-AR", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })} ${unit}`;
                              }
                              return unitLabel;
                            })()}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs">
                          Precio
                        </span>
                        {(() => {
                          if (isEditingDetails) {
                            if (itemIsWeightOrVolume && canEditMeasure) {
                              return (
                                <div className="flex items-center gap-1">
                                  <span className="text-sm">$</span>
                                  <Input
                                    className="h-8 w-20"
                                    min={0}
                                    onChange={(e) => {
                                      const value = Number.parseFloat(
                                        e.target.value
                                      );
                                      if (!Number.isNaN(value) && value >= 0) {
                                        handlePricePerKgChange(
                                          item.id,
                                          e.target.value
                                        );
                                      } else if (e.target.value === "") {
                                        handlePricePerKgChange(item.id, "0");
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
                                  className="h-8 w-20"
                                  min={0}
                                  onChange={(e) => {
                                    const value = Number.parseFloat(
                                      e.target.value
                                    );
                                    if (!Number.isNaN(value)) {
                                      handleUnitCostChange(
                                        item.id,
                                        e.target.value
                                      );
                                    } else if (e.target.value === "") {
                                      handleUnitCostChange(item.id, "0");
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
                          return (
                            <p className="text-sm">
                              {(() => {
                                if (
                                  itemIsWeightOrVolume &&
                                  item.total_weight_kg
                                ) {
                                  return formatCurrency(
                                    item.price_per_kg ?? item.unit_cost ?? 0
                                  );
                                }
                                return formatCurrency(item.unit_cost);
                              })()}
                            </p>
                          );
                        })()}
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs">
                          Descuento %
                        </span>
                        {isEditingDetails ? (
                          <Input
                            className="h-8 w-full"
                            inputMode="decimal"
                            max={100}
                            min={0}
                            onChange={(event) => {
                              handleDiscountChange(item.id, event.target.value);
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
                        ) : (
                          <p className="text-sm">
                            {item.discount_percent && item.discount_percent > 0
                              ? `${item.discount_percent}%`
                              : "-"}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col items-start gap-1 sm:items-end">
                        <span className="text-muted-foreground text-xs">
                          Subtotal
                        </span>
                        <p className="font-medium">
                          {formatCurrency(item.subtotal)}
                        </p>
                      </div>

                      {isEditingDetails && (
                        <div className="flex items-center justify-start sm:justify-end">
                          <Button
                            onClick={() => handleRemoveItem(item.id)}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
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
