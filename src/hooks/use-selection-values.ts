"use client";

import { useMemo, useState } from "react";
import type { ProductWithPrice } from "@/modules/purchases/service/purchases.service";
import type { InputUnit } from "@/modules/purchases/utils/purchase-calculations";
import { getAvailableUnits } from "@/modules/purchases/utils/purchase-calculations";

export function useSelectionValues(products: ProductWithPrice[]) {
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState<number | string>("");
  const [inputUnit, setInputUnit] = useState<InputUnit>("UNITS");
  const [openProduct, setOpenProduct] = useState(false);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  const availableUnits = useMemo(
    () => getAvailableUnits(selectedProduct),
    [selectedProduct]
  );

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
    parsedQuantity,
    isNonVariantQuantityInvalid,
    isAddDisabled,
  };
}
