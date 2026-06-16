"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { toast } from "sonner";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { InlinePriceEdit } from "@/components/products/inline-price-edit";
import {
  updateDirectMarginAction,
  updateDirectSalePriceAction,
  updateWholesaleMarginAction,
  updateWholesalePriceAction,
} from "@/modules/inventory/actions/pricing-grid.actions";
import type { ProductPricingItem } from "@/modules/inventory/types";

function formatCurrency(value: number | null): string {
  if (value == null) {
    return "—";
  }
  return `$ ${value.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export type SalesPriceListSelection = {
  type: string;
  value: number;
};

export function applySalesPriceListAdjustment(
  basePrice: number,
  list: SalesPriceListSelection
): number {
  if (list.type === "PRICE") {
    return Math.max(0, basePrice + list.value);
  }
  return basePrice * (1 + list.value / 100);
}

export function createColumns(
  orgSlug: string,
  mode: "wholesale" | "direct",
  onPriceUpdated?: () => void,
  selectedSalesPriceList?: { type: string; value: number } | null
): ColumnDef<ProductPricingItem>[] {
  const listSelected = selectedSalesPriceList != null;

  const applyListAdjustment = (basePrice: number): number => {
    if (!selectedSalesPriceList) {
      return basePrice;
    }
    return applySalesPriceListAdjustment(basePrice, selectedSalesPriceList);
  };

  const getAdjustedPrice = (basePrice: number | null): number | null => {
    if (!listSelected) {
      return basePrice;
    }
    if (basePrice == null) {
      return null;
    }
    return applyListAdjustment(basePrice);
  };

  const computeDisplayMargin = (
    effectivePrice: number | null,
    costPrice: number | null,
    fallbackMargin: number | null
  ): number | null => {
    if (effectivePrice != null && costPrice != null && costPrice > 0) {
      return ((effectivePrice - costPrice) / costPrice) * 100;
    }
    return fallbackMargin;
  };

  const handleSavePrice = async (
    productId: string,
    newPrice: number
  ): Promise<{ success: boolean; error?: string }> => {
    if (mode === "wholesale") {
      const result = await updateWholesalePriceAction(
        orgSlug,
        productId,
        newPrice
      );
      if (result.success) {
        onPriceUpdated?.();
      } else {
        toast.error(result.error || "Error al actualizar el precio");
      }
      return result;
    }

    const result = await updateDirectSalePriceAction(
      orgSlug,
      productId,
      newPrice
    );
    if (result.success) {
      onPriceUpdated?.();
    } else {
      toast.error(result.error || "Error al actualizar el precio");
    }
    return result;
  };

  const handleDeleteDirectPrice = async (
    productId: string
  ): Promise<{ success: boolean; error?: string }> => {
    const result = await updateDirectSalePriceAction(orgSlug, productId, null);
    if (result.success) {
      onPriceUpdated?.();
    } else {
      toast.error(result.error || "Error al eliminar el precio");
    }
    return result;
  };

  const handleSaveMargin = async (
    productId: string,
    newMargin: number
  ): Promise<{ success: boolean; error?: string }> => {
    if (mode === "wholesale") {
      const result = await updateWholesaleMarginAction(
        orgSlug,
        productId,
        newMargin
      );
      if (result.success) {
        onPriceUpdated?.();
      } else {
        toast.error(result.error || "Error al actualizar el margen");
      }
      return result;
    }

    const result = await updateDirectMarginAction(
      orgSlug,
      productId,
      newMargin
    );
    if (result.success) {
      onPriceUpdated?.();
    } else {
      toast.error(result.error || "Error al actualizar el margen");
    }
    return result;
  };

  return [
    {
      accessorKey: "sku",
      meta: { label: "SKU" },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="SKU" />
      ),
      cell: ({ row }) => {
        const sku = row.getValue("sku") as string | null;
        return sku ? (
          <Link
            className="block font-medium font-mono tabular-nums transition-colors hover:text-primary"
            href={`/org/${orgSlug}/stock/${row.original.product_id}`}
          >
            {sku}
          </Link>
        ) : (
          <span className="text-muted-foreground text-sm">-</span>
        );
      },
      enableGlobalFilter: true,
      enableSorting: true,
      size: 80,
    },
    {
      accessorKey: "name",
      meta: { label: "Producto" },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Producto" />
      ),
      cell: ({ row }) => {
        const name = row.getValue("name") as string;
        return (
          <Link
            className="block font-medium transition-colors hover:text-primary"
            href={`/org/${orgSlug}/stock/${row.original.product_id}`}
          >
            {name}
          </Link>
        );
      },
      enableGlobalFilter: true,
      enableSorting: true,
    },
    {
      accessorKey: "supplier_name",
      meta: { label: "Proveedor" },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Proveedor" />
      ),
      cell: ({ row }) => {
        const supplier = row.getValue("supplier_name") as string | null;
        return supplier ? (
          <span className="text-sm">{supplier}</span>
        ) : (
          <span className="text-muted-foreground text-sm">-</span>
        );
      },
      enableSorting: true,
      filterFn: (row, id, value: string[]) => {
        if (!value || value.length === 0) {
          return true;
        }
        const name = row.getValue(id) as string | null;
        return name ? value.includes(name) : false;
      },
    },
    {
      accessorKey: "category_name",
      enableColumnFilter: true,
      enableSorting: true,
      filterFn: (row, id, value: string[]) => {
        if (!value || value.length === 0) {
          return true;
        }
        const name = row.getValue(id) as string | null;
        return name ? value.includes(name) : false;
      },
      meta: { label: "Categoría" },
      cell: ({ row }) => {
        const name = row.getValue("category_name") as string | null;
        return name ? (
          <span className="text-sm">{name}</span>
        ) : (
          <span className="text-muted-foreground text-sm">-</span>
        );
      },
    },
    {
      accessorKey: "is_active",
      meta: { label: "Estado" },
      enableColumnFilter: true,
      cell: ({ row }) => {
        const isActive = row.getValue("is_active") as boolean;
        return (
          <span
            className={
              isActive
                ? "text-green-600 text-sm"
                : "text-muted-foreground text-sm"
            }
          >
            {isActive ? "Activo" : "Inactivo"}
          </span>
        );
      },
      filterFn: (row, id, value) => {
        const isActive = row.getValue(id) as boolean;
        const filterValues = Array.isArray(value) ? value : [value];
        if (filterValues.length === 0) {
          return true;
        }
        return filterValues.some((v) => {
          if (v === "active") {
            return isActive;
          }
          if (v === "inactive") {
            return !isActive;
          }
          return true;
        });
      },
    },
    {
      accessorKey: "cost_price",
      meta: { label: "Precio de compra" },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Precio de compra" />
      ),
      cell: ({ row }) => {
        const costPrice = row.getValue("cost_price") as number | null;
        return (
          <span className="font-medium tabular-nums">
            {formatCurrency(costPrice)}
          </span>
        );
      },
      enableSorting: true,
    },
    {
      id: "display_margin",
      meta: { label: "Margen (%)" },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Margen (%)" />
      ),
      cell: ({ row }) => {
        const item = row.original;
        const basePrice =
          mode === "direct" && item.direct_sale_price != null
            ? item.direct_sale_price
            : item.calculated_sale_price;

        const effectivePrice = getAdjustedPrice(basePrice);

        const margin = computeDisplayMargin(
          effectivePrice,
          item.cost_price,
          listSelected ? null : item.profit_margin
        );

        const isDisabled =
          item.cost_price == null || item.cost_price <= 0 || listSelected;

        return (
          <InlinePriceEdit
            disabled={isDisabled}
            disabledReason={
              listSelected ? "Vista previa" : "Sin precio de costo"
            }
            onSave={(newMargin) => handleSaveMargin(item.product_id, newMargin)}
            type="percentage"
            value={margin}
          />
        );
      },
      enableSorting: false,
    },
    {
      id: "sale_price",
      meta: { label: "Precio de venta" },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Precio de venta" />
      ),
      cell: ({ row }) => {
        const item = row.original;
        const basePrice =
          mode === "direct" && item.direct_sale_price != null
            ? item.direct_sale_price
            : item.calculated_sale_price;

        const displayPrice = getAdjustedPrice(basePrice);

        const isDisabled =
          listSelected ||
          (mode === "wholesale" &&
            (item.cost_price == null || item.cost_price <= 0));

        return (
          <InlinePriceEdit
            costPrice={item.cost_price}
            disabled={isDisabled}
            disabledReason={
              listSelected ? "Vista previa" : "Sin precio de costo"
            }
            onDelete={
              mode === "direct" && !listSelected
                ? () => handleDeleteDirectPrice(item.product_id)
                : undefined
            }
            onSave={(newPrice) => handleSavePrice(item.product_id, newPrice)}
            value={displayPrice}
          />
        );
      },
      enableSorting: true,
      sortingFn: (rowA, rowB) => {
        const rawA =
          mode === "direct" && rowA.original.direct_sale_price != null
            ? rowA.original.direct_sale_price
            : rowA.original.calculated_sale_price;
        const rawB =
          mode === "direct" && rowB.original.direct_sale_price != null
            ? rowB.original.direct_sale_price
            : rowB.original.calculated_sale_price;

        const a = getAdjustedPrice(rawA) ?? 0;
        const b = getAdjustedPrice(rawB) ?? 0;
        return a - b;
      },
    },
  ];
}
