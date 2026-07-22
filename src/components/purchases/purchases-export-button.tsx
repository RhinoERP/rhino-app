"use client";

import type { Table } from "@tanstack/react-table";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  applyCurrencyFormat,
  exportStatusLabels,
  formatExportCurrency,
  formatExportDate,
} from "@/lib/export-utils";
import type {
  PurchaseExportItem,
  PurchaseOrderWithSupplier,
} from "@/modules/purchases/service/purchases.service";

type PurchasesExportButtonProps = {
  table: Table<PurchaseOrderWithSupplier>;
  filename?: string;
  sheetName?: string;
};

type PurchaseExportFormat = "csv" | "xlsx";
type PurchaseStatus = PurchaseOrderWithSupplier["status"];
type ExportColumn = {
  id: string;
  label: string;
  valueGetter?: (
    purchase: PurchaseOrderWithSupplier,
    item?: PurchaseExportItem | null
  ) => string | number;
};

const columnWidthOverrides: Partial<Record<string, number>> = {
  purchase_number: 10,
  supplier: 28,
  purchase_date: 14,
  expiration_date: 14,
  remittance_number: 16,
  status: 14,
  total_amount: 16,
  product_name: 28,
  units: 12,
  unit_quantity: 12,
  unit_of_measure: 14,
  subtotal: 14,
};

const unitOfMeasureLabels: Record<
  NonNullable<PurchaseExportItem["unitOfMeasure"]>,
  string
> = {
  UN: "Unidad",
  KG: "Kg",
  LT: "Lt",
  MT: "Mt",
};

function formatFallbackValue(rawValue: unknown): string {
  return rawValue ? String(rawValue) : "—";
}

function formatPurchaseNumberValue(
  rawValue: unknown,
  purchase: PurchaseOrderWithSupplier
): string {
  const purchaseNumber =
    typeof rawValue === "number" ? rawValue : purchase.purchase_number;
  return purchaseNumber ? String(purchaseNumber) : "—";
}

function formatSupplierValue(
  rawValue: unknown,
  purchase: PurchaseOrderWithSupplier
): string {
  if (typeof rawValue === "string" && rawValue.trim().length > 0) {
    return rawValue;
  }
  return purchase.supplier?.name || "—";
}

function formatStatusValue(
  rawValue: unknown,
  purchase: PurchaseOrderWithSupplier
): string {
  const status = (
    typeof rawValue === "string" ? rawValue : purchase.status
  ) as PurchaseStatus;
  if (!status) {
    return "—";
  }
  return exportStatusLabels[status as keyof typeof exportStatusLabels] ?? "—";
}

type PurchaseColumnFormatter = (
  rawValue: unknown,
  purchase: PurchaseOrderWithSupplier
) => string;

const purchaseValueFormatters: Record<string, PurchaseColumnFormatter> = {
  purchase_number: formatPurchaseNumberValue,
  supplier: formatSupplierValue,
  purchase_date: (_rawValue, purchase) =>
    formatExportDate(purchase.purchase_date),
  expiration_date: (_rawValue, purchase) =>
    formatExportDate(purchase.expiration_date),
  remittance_number: (rawValue, purchase) => {
    if (typeof rawValue === "string" && rawValue.trim().length > 0) {
      return rawValue;
    }
    return purchase.remittance_number || "—";
  },
  status: formatStatusValue,
  total_amount: (rawValue, purchase) => {
    const amount =
      typeof rawValue === "number" ? rawValue : Number(purchase.total_amount);
    return formatExportCurrency(amount);
  },
};

function formatPurchaseValue(
  columnId: string,
  rawValue: unknown,
  purchase: PurchaseOrderWithSupplier
): string {
  const formatter = purchaseValueFormatters[columnId];
  if (formatter) {
    return formatter(rawValue, purchase);
  }
  return formatFallbackValue(rawValue);
}

function formatUnitOfMeasure(
  unit: PurchaseExportItem["unitOfMeasure"] | null | undefined
): string {
  if (!unit) {
    return "—";
  }
  return unitOfMeasureLabels[unit] ?? unit;
}

function calculateExportSubtotal(purchase: PurchaseOrderWithSupplier): number {
  const base = Number(purchase.subtotal_amount ?? 0);
  const discount = Number(purchase.global_discount_amount ?? 0);
  const safeBase = Number.isFinite(base) ? base : 0;
  const safeDiscount = Number.isFinite(discount) ? discount : 0;

  return Number((safeBase - safeDiscount).toFixed(2));
}

function buildExportContent(table: Table<PurchaseOrderWithSupplier>) {
  const visibleColumns = table
    .getVisibleLeafColumns()
    .filter((column) => column.id !== "actions" && column.id !== "select");

  const columns: ExportColumn[] = visibleColumns.map((column) => ({
    id: column.id,
    label: column.columnDef.meta?.label ?? column.id,
  }));

  const itemColumns: ExportColumn[] = [
    {
      id: "product_name",
      label: "Artículo",
      valueGetter: (_purchase, item) => item?.productName ?? "—",
    },
    {
      id: "units",
      label: "Unidades",
      valueGetter: (_purchase, item) =>
        item?.units !== null && item?.units !== undefined ? item.units : "",
    },
    {
      id: "unit_quantity",
      label: "Cantidad U.M.",
      valueGetter: (_purchase, item) =>
        item?.unitQuantity !== null && item?.unitQuantity !== undefined
          ? item.unitQuantity
          : "",
    },
    {
      id: "unit_of_measure",
      label: "Unidad de medida",
      valueGetter: (_purchase, item) =>
        item ? formatUnitOfMeasure(item.unitOfMeasure) : "",
    },
    {
      id: "subtotal",
      label: "Subtotal",
      valueGetter: (purchase) => calculateExportSubtotal(purchase),
    },
  ];

  const allColumns = [...columns, ...itemColumns];
  const subtotalIndex = allColumns.findIndex(
    (column) => column.id === "subtotal"
  );
  const totalIndex = allColumns.findIndex(
    (column) => column.id === "total_amount"
  );

  if (subtotalIndex > -1 && totalIndex > -1 && subtotalIndex > totalIndex) {
    const [subtotalColumn] = allColumns.splice(subtotalIndex, 1);
    allColumns.splice(totalIndex, 0, subtotalColumn);
  }

  const rows = table.getSortedRowModel().rows.flatMap((row) => {
    const purchase = row.original;
    const items =
      purchase.items && purchase.items.length > 0 ? purchase.items : [null];
    return items.map((item) =>
      allColumns.map((column) =>
        column.valueGetter
          ? column.valueGetter(purchase, item)
          : formatPurchaseValue(column.id, row.getValue(column.id), purchase)
      )
    );
  });

  const headers = allColumns.map((column) => column.label);

  return { headers, rows, columns: allColumns };
}

async function downloadPurchases(
  format: PurchaseExportFormat,
  table: Table<PurchaseOrderWithSupplier>,
  filename: string,
  sheetName: string
) {
  const { headers, rows, columns } = buildExportContent(table);
  if (headers.length === 0) {
    return;
  }

  const xlsxModule = await import("xlsx");
  const XLSX = xlsxModule.default ?? xlsxModule;

  const dataForSheet = [
    headers,
    ...rows.map((row) =>
      row.map((cell, index) => {
        const columnId = columns[index].id;
        if (
          ["total_amount", "subtotal"].includes(columnId) &&
          typeof cell === "string" &&
          cell !== "—" &&
          cell !== ""
        ) {
          return Number.parseFloat(cell);
        }
        return cell;
      })
    ),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(dataForSheet);

  applyCurrencyFormat(
    worksheet,
    columns.map((column, index) => ({ id: column.id, index })),
    rows.length
  );

  const estimatedWidths = columns.map((column, columnIndex) => {
    const override = columnWidthOverrides[column.id];
    if (override) {
      return override;
    }

    const maxChars = Math.max(
      column.label.length,
      ...rows.map((row) => {
        const value = row[columnIndex];
        if (typeof value === "number") {
          return value.toString().length;
        }
        if (typeof value === "string") {
          return value.length;
        }
        return 0;
      })
    );

    return Math.min(Math.max(maxChars + 2, 10), 40);
  });

  worksheet["!cols"] = estimatedWidths.map((wch) => ({ wch }));

  let blob: Blob;
  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  } else {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const today = new Date().toISOString().split("T")[0];
  link.href = url;
  link.download = `${filename}-${today}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function PurchasesExportButton({
  table,
  filename = "compras",
  sheetName = "Compras",
}: PurchasesExportButtonProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => downloadPurchases("csv", table, filename, sheetName)}
        >
          <FileText className="mr-2 h-4 w-4" />
          Exportar CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => downloadPurchases("xlsx", table, filename, sheetName)}
        >
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Exportar Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
