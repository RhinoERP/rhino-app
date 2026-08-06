"use client";

import { CaretDown, Warning } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { StockItem } from "@/modules/inventory/types";

function getUnitsCellData(item: StockItem): {
  unitsValue: number | null;
  isLowStock: boolean;
} {
  const unitOfMeasure = item.unit_of_measure ?? "UN";
  const isUnitProduct = unitOfMeasure === "UN";
  const tracksUnits =
    (unitOfMeasure === "KG" || unitOfMeasure === "LT") &&
    Boolean(item.tracks_stock_units);

  let unitsValue: number | null = null;
  if (isUnitProduct) {
    unitsValue = item.total_stock ?? 0;
  } else if (tracksUnits) {
    unitsValue = item.total_unit_stock ?? 0;
  }

  return {
    unitsValue,
    isLowStock: isUnitProduct && (unitsValue ?? 0) <= 0,
  };
}

function getWeightUnitLabel(unitOfMeasure: string): string {
  if (unitOfMeasure === "KG") {
    return "kg";
  }
  if (unitOfMeasure === "LT") {
    return "lt";
  }
  return "m";
}

function renderUnitsCell(item: StockItem) {
  const { unitsValue, isLowStock } = getUnitsCellData(item);

  if (unitsValue == null) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }

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
        {unitsValue.toLocaleString("es-AR", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })}{" "}
        un
      </span>
    </div>
  );
}

function renderMeasureCell(item: StockItem) {
  const unitOfMeasure = item.unit_of_measure ?? "UN";
  const isWeightBased =
    unitOfMeasure === "KG" || unitOfMeasure === "LT" || unitOfMeasure === "MT";
  const stockValue = isWeightBased ? (item.total_stock ?? 0) : null;
  const isLowStock = isWeightBased && (stockValue ?? 0) <= 0;
  const unitLabel = getWeightUnitLabel(unitOfMeasure);

  if (!isWeightBased) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }

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
        {(stockValue ?? 0).toLocaleString("es-AR", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        })}{" "}
        {unitLabel}
      </span>
    </div>
  );
}

export function createColumns(
  orgSlug: string,
  canManageInventory = true
): ColumnDef<StockItem>[] {
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
      accessorKey: "sku",
      meta: { label: "SKU" },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="SKU" />
      ),
      cell: ({ row }) => {
        const sku = row.getValue("sku") as string | null;
        return sku ? (
          <Link
            className="block transition-colors hover:text-primary"
            href={`/org/${orgSlug}/stock/${row.original.product_id}`}
          >
            <span className="font-medium font-mono tabular-nums">{sku}</span>
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
      accessorKey: "product_name",
      meta: { label: "Producto" },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Producto" />
      ),
      cell: ({ row }) => {
        const productName = row.getValue("product_name") as string;
        const href = `/org/${orgSlug}/stock/${row.original.product_id}`;

        return (
          <Link
            className="block transition-colors hover:text-primary"
            href={href}
          >
            <div className="font-medium">{productName}</div>
          </Link>
        );
      },
      enableGlobalFilter: true,
      enableSorting: true,
    },
    {
      id: "expand",
      cell: ({ row }) => {
        if (!row.original.has_variants) {
          return null;
        }
        return (
          <Button
            className="h-7 w-7"
            onClick={() => row.toggleExpanded()}
            size="icon"
            variant="ghost"
          >
            <CaretDown
              className={cn(
                "size-4 transition-transform",
                row.getIsExpanded() ? "rotate-0" : "-rotate-90"
              )}
            />
          </Button>
        );
      },
      enableSorting: false,
      enableHiding: false,
      meta: { label: "" },
      size: 40,
    },
    {
      accessorKey: "category_name",
      meta: { label: "Categoría" },
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
      filterFn: (row, id, value: string[]) => {
        if (!value || value.length === 0) {
          return true;
        }
        const categoryName = row.getValue(id) as string | null;
        return categoryName ? value.includes(categoryName) : false;
      },
      enableColumnFilter: true,
      enableSorting: true,
    },
    {
      accessorKey: canManageInventory ? "supplier_name" : "brand",
      meta: { label: canManageInventory ? "Proveedor" : "Marca" },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          label={canManageInventory ? "Proveedor" : "Marca"}
        />
      ),
      cell: ({ row }) => {
        const value = row.getValue(
          canManageInventory ? "supplier_name" : "brand"
        ) as string | null;
        return value ? (
          <span className="text-sm">{value}</span>
        ) : (
          <span className="text-muted-foreground text-sm">-</span>
        );
      },
    },
    {
      id: "stock_units",
      accessorFn: (row) => {
        const unit = row.unit_of_measure ?? "UN";
        if (unit === "UN") {
          return row.total_stock ?? 0;
        }
        if ((unit === "KG" || unit === "LT") && row.tracks_stock_units) {
          return row.total_unit_stock ?? 0;
        }
        return null;
      },
      meta: { label: "Stock (unidades)" },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Stock (unidades)" />
      ),
      cell: ({ row }) => renderUnitsCell(row.original),
      enableSorting: false,
    },
    {
      id: "stock_measure",
      accessorFn: (row) => {
        const unit = row.unit_of_measure ?? "UN";
        if (unit === "KG" || unit === "LT" || unit === "MT") {
          return row.total_stock ?? 0;
        }
        return null;
      },
      meta: { label: "Stock (kg/lt)" },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Stock (kg/lt)" />
      ),
      cell: ({ row }) => renderMeasureCell(row.original),
      enableSorting: false,
    },
    {
      accessorKey: "sale_price",
      meta: { label: "Precio de Venta" },
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
      meta: { label: "Margen (%)" },
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
      meta: { label: "Estado" },
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
      enableSorting: false,
    },
  ];
}
