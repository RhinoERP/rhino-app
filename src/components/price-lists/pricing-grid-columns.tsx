"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { toast } from "sonner";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { InlinePriceEdit } from "@/components/products/inline-price-edit";
import {
  updateDirectSalePriceAction,
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

function formatMargin(value: number | null): string {
  if (value == null) {
    return "—";
  }
  return `${value.toLocaleString("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

export function createColumns(
  orgSlug: string,
  mode: "wholesale" | "direct",
  onPriceUpdated?: () => void
): ColumnDef<ProductPricingItem>[] {
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
        let margin: number | null;

        if (
          mode === "direct" &&
          item.direct_sale_price != null &&
          item.cost_price != null &&
          item.cost_price > 0
        ) {
          margin =
            ((item.direct_sale_price - item.cost_price) / item.cost_price) *
            100;
        } else {
          margin = item.profit_margin;
        }

        return <span className="tabular-nums">{formatMargin(margin)}</span>;
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
        const displayPrice =
          mode === "direct" && item.direct_sale_price != null
            ? item.direct_sale_price
            : item.calculated_sale_price;

        const isDisabled =
          mode === "wholesale" &&
          (item.cost_price == null || item.cost_price <= 0);

        return (
          <InlinePriceEdit
            costPrice={item.cost_price}
            disabled={isDisabled}
            disabledReason="Sin precio de costo"
            onDelete={
              mode === "direct"
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
        const a =
          mode === "direct" && rowA.original.direct_sale_price != null
            ? rowA.original.direct_sale_price
            : rowA.original.calculated_sale_price;
        const b =
          mode === "direct" && rowB.original.direct_sale_price != null
            ? rowB.original.direct_sale_price
            : rowB.original.calculated_sale_price;
        return (a ?? 0) - (b ?? 0);
      },
    },
  ];
}
