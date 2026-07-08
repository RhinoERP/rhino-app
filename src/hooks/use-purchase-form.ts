"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProductWithPrice } from "@/modules/purchases/service/purchases.service";
import type { InputUnit } from "@/modules/purchases/utils/purchase-calculations";
import {
  calculateSubtotal,
  convertToBaseUnits,
  getAvailableUnits,
  getPricePerKg,
} from "@/modules/purchases/utils/purchase-calculations";

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
  has_variants?: boolean;
  variant_stocks?: Record<string, Record<string, number>>;
};

function isWeightOrVolumeUnit(unit: string): boolean {
  return unit === "KG" || unit === "LT" || unit === "MT";
}

function buildPurchaseItem(
  product: ProductWithPrice,
  quantity = 0,
  inputUnit: InputUnit = "UNITS"
): PurchaseItem | null {
  const baseQuantity = convertToBaseUnits(quantity, inputUnit, product);
  const unitCost = product.cost_price ?? 0;
  const unitOfMeasure = product.unit_of_measure || "UN";
  const weightPerUnit = product.weight_per_unit;
  const isWeightOrVolume =
    unitOfMeasure === "KG" || unitOfMeasure === "LT" || unitOfMeasure === "MT";

  let unitQuantity: number;
  let totalWeight: number | null;

  if (isWeightOrVolume && weightPerUnit && weightPerUnit > 0) {
    unitQuantity = baseQuantity * weightPerUnit;
    totalWeight = unitQuantity;
  } else {
    unitQuantity = baseQuantity;
    totalWeight = null;
  }

  const unitQuantityVal = unitQuantity;
  const pricePerKg = getPricePerKg(unitOfMeasure, product.cost_price);
  const subtotal = calculateSubtotal({
    totalWeight,
    pricePerKg,
    quantity: baseQuantity,
    unitCost,
    discountPercent: 0,
  });

  if (!(product.id && product.name)) {
    return null;
  }

  return {
    product_id: product.id,
    product_name: product.name,
    quantity: baseQuantity,
    unit_quantity: unitQuantityVal,
    unit_cost: unitCost,
    subtotal,
    unit_of_measure: unitOfMeasure,
    weight_per_unit: weightPerUnit,
    total_weight_kg: totalWeight ?? undefined,
    price_per_kg: pricePerKg,
    discount_percent: 0,
    has_variants: product.has_variants ?? false,
    variant_stocks: product.has_variants ? {} : undefined,
  };
}

function addPurchaseItem(
  selectedProduct: ProductWithPrice,
  quantity: number | string,
  inputUnit: InputUnit
): PurchaseItem | null {
  if (selectedProduct.has_variants) {
    return buildPurchaseItem(selectedProduct);
  }
  const parsedQuantity =
    typeof quantity === "string" ? Number.parseFloat(quantity) : quantity;
  if (Number.isNaN(parsedQuantity) || parsedQuantity <= 0) {
    return null;
  }
  return buildPurchaseItem(selectedProduct, parsedQuantity, inputUnit);
}

function computeTotalVariantQuantity(
  stocks: Record<string, Record<string, number>>
): number {
  return Object.values(stocks).reduce(
    (sum, talles) => sum + Object.values(talles).reduce((s, q) => s + q, 0),
    0
  );
}

function buildUpdatedQuantityItem(
  item: PurchaseItem,
  quantity: number
): PurchaseItem {
  const validatedQuantity = Math.max(0, quantity);
  const isWeightOrVolume = isWeightOrVolumeUnit(item.unit_of_measure);
  const weightPerUnit = item.weight_per_unit ?? 0;
  const shouldCalculateWeight = isWeightOrVolume && weightPerUnit > 0;
  const unitQuantity = shouldCalculateWeight
    ? validatedQuantity * weightPerUnit
    : validatedQuantity;
  const totalWeight = shouldCalculateWeight ? unitQuantity : null;

  return {
    ...item,
    quantity: validatedQuantity,
    unit_quantity: unitQuantity,
    subtotal: calculateSubtotal({
      totalWeight,
      pricePerKg: item.price_per_kg,
      quantity: validatedQuantity,
      unitCost: item.unit_cost,
      discountPercent: item.discount_percent ?? 0,
    }),
    total_weight_kg: totalWeight ?? undefined,
  };
}

function buildUpdatedUnitCostItem(
  item: PurchaseItem,
  cost: number
): PurchaseItem {
  const pricePerKg = item.unit_of_measure === "KG" ? cost : item.price_per_kg;

  return {
    ...item,
    unit_cost: cost,
    price_per_kg: pricePerKg,
    subtotal: calculateSubtotal({
      totalWeight: item.total_weight_kg ?? null,
      pricePerKg,
      quantity: item.quantity,
      unitCost: cost,
      discountPercent: item.discount_percent ?? 0,
    }),
  };
}

function buildUpdatedPricePerKgItem(
  item: PurchaseItem,
  pricePerKg: number
): PurchaseItem {
  const unitCost = item.unit_of_measure === "KG" ? pricePerKg : item.unit_cost;

  return {
    ...item,
    unit_cost: unitCost,
    price_per_kg: pricePerKg,
    subtotal: calculateSubtotal({
      totalWeight: item.total_weight_kg ?? null,
      pricePerKg,
      quantity: item.quantity,
      unitCost,
      discountPercent: item.discount_percent ?? 0,
    }),
  };
}

function buildUpdatedDiscountItem(
  item: PurchaseItem,
  discountPercent: number
): PurchaseItem {
  const validatedDiscount = Math.min(Math.max(0, discountPercent), 100);

  return {
    ...item,
    discount_percent: validatedDiscount,
    subtotal: calculateSubtotal({
      totalWeight: item.total_weight_kg ?? null,
      pricePerKg: item.price_per_kg,
      quantity: item.quantity,
      unitCost: item.unit_cost,
      discountPercent: validatedDiscount,
    }),
  };
}

const ITEM_BUILDER_MAP: Record<
  string,
  (item: PurchaseItem, v: number) => PurchaseItem
> = {
  quantity: buildUpdatedQuantityItem,
  unitCost: buildUpdatedUnitCostItem,
  pricePerKg: buildUpdatedPricePerKgItem,
  discount: buildUpdatedDiscountItem,
};

function resetPurchaseSelection(
  setSelectedProductId: (value: string) => void,
  setOpenProduct: (value: boolean) => void,
  setQuantity?: (value: number | string) => void,
  setInputUnit?: (value: InputUnit) => void
) {
  setSelectedProductId("");
  setOpenProduct(false);

  if (setQuantity) {
    setQuantity("");
  }

  if (setInputUnit) {
    setInputUnit("UNITS");
  }
}

type ItemField = "quantity" | "unitCost" | "pricePerKg" | "discount";

export function useSelectionState(
  products: ProductWithPrice[],
  availableProducts: ProductWithPrice[],
  isLoadingProducts: boolean
) {
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState<number | string>("");
  const [inputUnit, setInputUnit] = useState<InputUnit>("UNITS");
  const [openProduct, setOpenProduct] = useState(false);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  const availableUnits = useMemo(
    () => getAvailableUnits(selectedProduct),
    [selectedProduct]
  );

  let selectButtonLabel = "Seleccione un producto";
  if (isLoadingProducts) {
    selectButtonLabel = "Cargando productos...";
  } else if (availableProducts.length === 0) {
    selectButtonLabel = "No hay productos disponibles";
  }

  const parsedQuantity =
    typeof quantity === "string" ? Number.parseFloat(quantity) : quantity;

  const isNonVariantQuantityInvalid =
    !selectedProduct?.has_variants &&
    (!quantity || Number.isNaN(parsedQuantity) || parsedQuantity <= 0);

  const isAddDisabled = !selectedProductId || isNonVariantQuantityInvalid;

  return {
    selectedProductId,
    setSelectedProductId,
    quantity,
    setQuantity,
    inputUnit,
    setInputUnit,
    openProduct,
    setOpenProduct,
    selectedProduct,
    availableUnits,
    selectButtonLabel,
    parsedQuantity,
    isNonVariantQuantityInvalid,
    isAddDisabled,
  };
}

export function useItemManagement(
  items: PurchaseItem[],
  onUpdateItem: (index: number, item: PurchaseItem) => void
) {
  const handleVariantStockChange = (
    index: number,
    color: string,
    talle: string,
    value: number
  ) => {
    const item = items[index];

    if (!item?.has_variants) {
      return;
    }

    const currentStocks = item.variant_stocks ?? {};
    const updatedStocks = {
      ...currentStocks,
      [color]: {
        ...(currentStocks[color] ?? {}),
        [talle]: value,
      },
    };
    const totalQty = computeTotalVariantQuantity(updatedStocks);
    const validatedQty = Math.max(0, totalQty);

    const subtotal = calculateSubtotal({
      totalWeight: null,
      pricePerKg: item.price_per_kg,
      quantity: validatedQty,
      unitCost: item.unit_cost,
      discountPercent: item.discount_percent ?? 0,
    });

    onUpdateItem(index, {
      ...item,
      quantity: validatedQty,
      unit_quantity: validatedQty,
      variant_stocks: updatedStocks,
      subtotal,
    });
  };

  const handleItemUpdate =
    (field: ItemField) => (index: number, value: number) => {
      const item = items[index];

      if (!item) {
        return;
      }

      onUpdateItem(index, ITEM_BUILDER_MAP[field](item, value));
    };

  return {
    handleVariantStockChange,
    handleItemUpdate,
  };
}

type AddItemHandlerProps = {
  selectedProduct: ProductWithPrice | undefined;
  quantity: number | string;
  inputUnit: InputUnit;
  availableUnits: InputUnit[];
  onAddItem: (item: PurchaseItem) => void;
  setSelectedProductId: (value: string) => void;
  setOpenProduct: (value: boolean) => void;
  setQuantity: (value: number | string) => void;
  setInputUnit: (value: InputUnit) => void;
};

export function useAddItemHandler({
  selectedProduct,
  quantity,
  inputUnit,
  availableUnits,
  onAddItem,
  setSelectedProductId,
  setOpenProduct,
  setQuantity,
  setInputUnit,
}: AddItemHandlerProps) {
  useEffect(() => {
    if (selectedProduct && !availableUnits.includes(inputUnit)) {
      setInputUnit(availableUnits[0] ?? "UNITS");
    }
  }, [selectedProduct, availableUnits, inputUnit, setInputUnit]);

  const handleAddItem = () => {
    if (!selectedProduct) {
      return;
    }

    const newItem = addPurchaseItem(selectedProduct, quantity, inputUnit);

    if (!newItem) {
      return;
    }

    onAddItem(newItem);
    resetPurchaseSelection(
      setSelectedProductId,
      setOpenProduct,
      setQuantity,
      setInputUnit
    );
  };

  const handleQuantityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddItem();
    }
  };

  return {
    handleAddItem,
    handleQuantityKeyDown,
  };
}
