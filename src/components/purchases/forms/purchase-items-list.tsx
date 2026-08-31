"use client";

import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useProductFilters } from "@/hooks/use-product-filters";
import {
  type PurchaseItem,
  useAddItemHandler,
  useItemManagement,
  useSelectionState,
} from "@/hooks/use-purchase-form";
import { useVariantLoader } from "@/hooks/use-variant-loader";
import type { Category } from "@/modules/categories/types";
import type { ProductWithPrice } from "@/modules/purchases/service/purchases.service";
import { FilterPopover } from "./filter-popover";
import { ItemsView } from "./items-view";
import { ProductSection } from "./product-section";

export type { PurchaseItem } from "@/hooks/use-purchase-form";

type PurchaseItemsListProps = {
  orgSlug: string;
  products: ProductWithPrice[];
  items: PurchaseItem[];
  onAddItem: (item: PurchaseItem) => void;
  onUpdateItem: (index: number, item: PurchaseItem) => void;
  onRemoveItem: (index: number) => void;
  isLoadingProducts: boolean;
  categories?: Category[];
};

export function PurchaseItemsList({
  orgSlug,
  products,
  items,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  isLoadingProducts,
  categories = [],
}: PurchaseItemsListProps) {
  const { variantMetaMap } = useVariantLoader(orgSlug, items);

  const {
    brandFilter,
    setBrandFilter,
    categoryFilter,
    setCategoryFilter,
    brandOptions,
    categoryOptions,
    availableProducts,
    currency,
  } = useProductFilters(products, categories, items);

  const {
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
    isAddDisabled,
  } = useSelectionState(products, availableProducts, isLoadingProducts);

  const { handleVariantStockChange, handleItemUpdate } = useItemManagement(
    items,
    onUpdateItem
  );

  const { handleAddItem, handleQuantityKeyDown } = useAddItemHandler({
    selectedProduct,
    quantity,
    inputUnit,
    availableUnits,
    onAddItem,
    setSelectedProductId,
    setOpenProduct,
    setQuantity,
    setInputUnit,
  });

  const brandFilterOptions = useMemo(
    () => brandOptions.map((brand) => ({ value: brand, label: brand })),
    [brandOptions]
  );

  const categoryFilterOptions = useMemo(
    () =>
      categoryOptions.map((cat) => ({
        value: cat.id,
        label: cat.name,
      })),
    [categoryOptions]
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
              <FilterPopover
                label="Marca"
                onSelect={setBrandFilter}
                options={brandFilterOptions}
                placeholder="Buscar marca..."
                selectedValue={brandFilter}
              />
              <FilterPopover
                label="Categoría"
                onSelect={setCategoryFilter}
                options={categoryFilterOptions}
                placeholder="Buscar categoría..."
                selectedValue={categoryFilter}
              />
            </div>
            <ProductSection
              availableProducts={availableProducts}
              availableUnits={availableUnits}
              inputUnit={inputUnit}
              isAddDisabled={isAddDisabled}
              isLoadingProducts={isLoadingProducts}
              isOpen={openProduct}
              onAddItem={handleAddItem}
              onOpenChange={setOpenProduct}
              onQuantityChange={setQuantity}
              onQuantityKeyDown={handleQuantityKeyDown}
              onSelectProduct={setSelectedProductId}
              onUnitChange={setInputUnit}
              quantity={quantity}
              selectButtonLabel={selectButtonLabel}
              selectedProduct={selectedProduct}
              selectedProductId={selectedProductId}
            />
          </div>
          <ItemsView
            currency={currency}
            handleUpdateDiscount={handleItemUpdate("discount")}
            handleUpdatePricePerKg={handleItemUpdate("pricePerKg")}
            handleUpdateQuantity={handleItemUpdate("quantity")}
            handleUpdateUnitCost={handleItemUpdate("unitCost")}
            handleVariantStockChange={handleVariantStockChange}
            items={items}
            onRemoveItem={onRemoveItem}
            products={products}
            variantMetaMap={variantMetaMap}
          />
        </div>
      </CardContent>
    </Card>
  );
}
