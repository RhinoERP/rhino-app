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
    id: "price",
    accessorKey: "price",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Precio" />
    ),
    cell: ({ row }) => formatCurrency(row.original.price),
    enableColumnFilter: false,
    enableSorting: true,
    enableHiding: true,
  },
];
