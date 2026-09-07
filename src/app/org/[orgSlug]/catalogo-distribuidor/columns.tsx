"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { formatCurrency } from "@/lib/format";
import type { DistributorCatalogItem } from "@/modules/inventory/service/inventory.service";

function getUnitLabel(unitOfMeasure: string | null): string {
  if (unitOfMeasure === "KG") {
    return "kg";
  }
  if (unitOfMeasure === "LT") {
    return "lt";
  }
  if (unitOfMeasure === "MT") {
    return "m";
  }
  return "un";
}

export function createDistributorCatalogColumns(): ColumnDef<DistributorCatalogItem>[] {
  return [
    {
      accessorKey: "sku",
      meta: { label: "SKU" },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="SKU" />
      ),
      cell: ({ row }) => {
        const sku = row.getValue("sku") as string;
        return sku ? (
          <span className="font-medium font-mono tabular-nums">{sku}</span>
        ) : (
          <span className="text-muted-foreground text-sm">-</span>
        );
      },
      enableGlobalFilter: true,
      enableSorting: true,
    },
    {
      accessorKey: "name",
      meta: { label: "Producto" },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Producto" />
      ),
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue("name") as string}</div>
      ),
      enableGlobalFilter: true,
      enableSorting: true,
    },
    {
      accessorKey: "brand",
      meta: { label: "Marca" },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Marca" />
      ),
      cell: ({ row }) => {
        const brand = row.getValue("brand") as string | null;
        return brand ? (
          <span className="text-sm">{brand}</span>
        ) : (
          <span className="text-muted-foreground text-sm">-</span>
        );
      },
      enableSorting: true,
    },
    {
      accessorKey: "total_stock",
      meta: { label: "Stock" },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Stock" />
      ),
      cell: ({ row }) => {
        const value = row.getValue("total_stock") as number;
        const unit = getUnitLabel(row.original.unit_of_measure);
        return (
          <span className="tabular-nums">
            {value.toLocaleString("es-AR")} {unit}
          </span>
        );
      },
      enableSorting: true,
    },
    {
      accessorKey: "distributor_price",
      meta: { label: "Precio" },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Precio" />
      ),
      cell: ({ row }) => {
        const price = row.getValue("distributor_price") as number | null;
        return price != null ? (
          <span className="font-medium tabular-nums">
            {formatCurrency(price)}
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">-</span>
        );
      },
      enableSorting: true,
    },
  ];
}
