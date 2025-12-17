"use client";

import { Warning } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { StockItem } from "@/modules/inventory/types";

export function createColumns(): ColumnDef<StockItem>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          aria-label="Seleccionar todos"
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label="Seleccionar fila"
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
      maxSize: 40,
    },
    {
      accessorKey: "product_name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Producto" />
      ),
      cell: ({ row }) => {
        const productName = row.getValue("product_name") as string;
        const brand = row.original.brand;

        return (
          <div className="space-y-1">
            <div className="font-medium">{productName}</div>
            {brand && (
              <div className="text-muted-foreground text-sm">{brand}</div>
            )}
          </div>
        );
      },
      enableGlobalFilter: true,
      enableSorting: true,
    },
    {
      accessorKey: "category_name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Categoría" />
      ),
      cell: ({ row }) => {
        const category = row.getValue("category_name") as string | null;
        return category ? (
          <span className="text-sm">{category}</span>
        ) : (
          <span className="text-muted-foreground text-sm">-</span>
        );
      },
    },
    {
      accessorKey: "supplier_name",
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
    },
    {
      accessorKey: "total_stock",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Stock Total" />
      ),
      cell: ({ row }) => {
        const stock = row.getValue("total_stock") as number;
        const isLowStock = stock <= 0;

        return (
          <div className="flex items-center gap-2">
            {isLowStock && (
              <Warning className="size-4 text-destructive" weight="fill" />
            )}
            <span
              className={`font-medium tabular-nums ${
                isLowStock ? "text-destructive" : "text-foreground"
              }`}
            >
              {stock.toLocaleString()}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "sale_price",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Precio de Venta" />
      ),
      cell: ({ row }) => {
        const salePrice = row.getValue("sale_price") as
          | number
          | null
          | undefined;
        return salePrice != null ? (
          <span className="font-medium tabular-nums">
            $
            {salePrice.toLocaleString("es-AR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">-</span>
        );
      },
    },
    {
      accessorKey: "profit_margin",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Margen (%)" />
      ),
      cell: ({ row }) => {
        const profitMargin = row.getValue("profit_margin") as
          | number
          | null
          | undefined;
        return profitMargin != null ? (
          <span className="font-medium tabular-nums">
            {profitMargin.toLocaleString("es-AR", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            })}
            %
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">-</span>
        );
      },
    },
    {
      accessorKey: "is_active",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Estado" />
      ),
      cell: ({ row }) => {
        const isActive = row.getValue("is_active") as boolean;
        return (
          <Badge variant={isActive ? "default" : "secondary"}>
            {isActive ? "Activo" : "Inactivo"}
          </Badge>
        );
      },
      filterFn: (row, id, value) => {
        const isActive = row.getValue(id) as boolean;
        if (value === "active") {
          return isActive;
        }
        if (value === "inactive") {
          return !isActive;
        }
        return true;
      },
    },
  ];
}
