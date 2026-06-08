"use client";

import { useState } from "react";
import type { PurchaseItem } from "@/components/purchases/forms/purchase-items-list";
import type { Category } from "@/modules/categories/types";
import type { ProductWithPrice } from "@/modules/purchases/service/purchases.service";

function computeBrandOptions(products: ProductWithPrice[]): string[] {
  const brands = new Set<string>();
  for (const product of products) {
    const brand = product.brand?.trim();
    if (brand) {
      brands.add(brand);
    }
  }
  return Array.from(brands).sort((a, b) => a.localeCompare(b));
}

function computeCategoryOptions(
  categories: Category[],
  products: ProductWithPrice[]
): Category[] {
  return categories
    .filter((cat) => products.some((p) => p.category_id === cat.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function filterProducts(
  products: ProductWithPrice[],
  brandFilter: string,
  categoryFilter: string
): ProductWithPrice[] {
  return products.filter((product) => {
    const normalizedBrand = product.brand?.trim() ?? "";
    if (brandFilter && normalizedBrand !== brandFilter) {
      return false;
    }
    if (categoryFilter && product.category_id !== categoryFilter) {
      return false;
    }
    return true;
  });
}

export function useProductFilters(
  products: ProductWithPrice[],
  categories: Category[],
  items: PurchaseItem[]
) {
  const [brandFilter, setBrandFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const brandOptions = computeBrandOptions(products);
  const categoryOptions = computeCategoryOptions(categories, products);
  const filteredProducts = filterProducts(
    products,
    brandFilter,
    categoryFilter
  );

  const availableProducts = filteredProducts.filter(
    (p) => !items.some((item) => item.product_id === p.id)
  );

  const brandFilterLabel = brandFilter
    ? (brandOptions.find((brand) => brand === brandFilter) ?? "Todas")
    : "Todas";

  const categoryFilterLabel = categoryFilter
    ? (categoryOptions.find((option) => option.id === categoryFilter)?.name ??
      "Todas")
    : "Todas";

  return {
    brandFilter,
    setBrandFilter,
    categoryFilter,
    setCategoryFilter,
    brandOptions,
    categoryOptions,
    filteredProducts,
    availableProducts,
    brandFilterLabel,
    categoryFilterLabel,
  };
}
