"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency } from "@/lib/format";
import type { PriceListItem } from "@/modules/price-lists/types";

export const createPriceListItemColumns = (): ColumnDef<PriceListItem>[] => [
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
    id: "sku",
    accessorKey: "sku",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="SKU" />
    ),
    cell: ({ row }) => <div className="font-medium">{row.original.sku}</div>,
    enableColumnFilter: false,
    enableSorting: true,
    enableHiding: false,
  },
  {
    id: "product_name",
    accessorKey: "product_name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Producto" />
    ),
    cell: ({ row }) => row.original.product_name ?? "—",
    enableColumnFilter: false,
    enableSorting: true,
    enableHiding: false,
  },
  {
    id: "purchase_price",
    accessorKey: "purchase_price",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Precio compra" />
    ),
    cell: ({ row }) =>
      formatCurrency(row.original.purchase_price ?? 0, row.original.currency),
    enableColumnFilter: false,
    enableSorting: true,
    enableHiding: true,
  },
  {
    id: "product_margin",
    accessorKey: "product_margin",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Margen producto" />
    ),
    cell: ({ row }) => {
      const margin = row.original.product_margin;

      if (margin === null || margin === undefined || !Number.isFinite(margin)) {
        return "—";
      }

      const rounded = Number(margin.toFixed(2));
      const prefix = rounded > 0 ? "+" : "";
      return `${prefix}${rounded}%`;
    },
    enableColumnFilter: false,
    enableSorting: true,
    enableHiding: true,
  },
  {
    id: "calculated_sale_price",
    accessorKey: "calculated_sale_price",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Precio venta" />
    ),
    cell: ({ row }) => {
      const salePrice = row.original.calculated_sale_price;

      if (salePrice === null || salePrice === undefined) {
        return "—";
      }

      return formatCurrency(salePrice, row.original.currency);
    },
    enableColumnFilter: false,
    enableSorting: true,
    enableHiding: true,
  },
  {
    id: "currency",
    accessorKey: "currency",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Moneda" />
    ),
    cell: ({ row }) => (
      <div className="font-medium">{row.original.currency ?? "ARS"}</div>
    ),
    enableColumnFilter: false,
    enableSorting: true,
    enableHiding: true,
  },
];
