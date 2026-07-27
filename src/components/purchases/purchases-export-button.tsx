"use client";

import type { Table } from "@tanstack/react-table";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  applyCurrencyFormat,
  exportStatusLabels,
  formatExportCurrency,
  formatExportDate,
} from "@/lib/export-utils";
import { getPurchasesExportAction } from "@/modules/purchases/actions/get-purchases-export.action";
import type {
  PurchaseExportItem,
  PurchaseOrderWithSupplier,
} from "@/modules/purchases/service/purchases.service";

type PurchasesExportButtonProps = {
  orgSlug: string;
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
  purchase_number: (_rawValue, purchase) =>
    purchase.purchase_number ? String(purchase.purchase_number) : "—",
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
  total_amount: (_rawValue, purchase) =>
    formatExportCurrency(Number(purchase.total_amount)),
};

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

type BuildContentResult = {
  headers: string[];
  rows: (string | number)[][];
  columns: ExportColumn[];
};

function buildContentFromPurchases(
  purchases: PurchaseOrderWithSupplier[],
  columnIds: string[],
  columnLabels: Record<string, string>
): BuildContentResult {
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

  const columns: ExportColumn[] = [
    ...columnIds.map((id) => ({ id, label: columnLabels[id] ?? id })),
    ...itemColumns,
  ];

  const subtotalIndex = columns.findIndex((c) => c.id === "subtotal");
  const totalIndex = columns.findIndex((c) => c.id === "total_amount");

  if (subtotalIndex > -1 && totalIndex > -1 && subtotalIndex > totalIndex) {
    const [subtotalColumn] = columns.splice(subtotalIndex, 1);
    columns.splice(totalIndex, 0, subtotalColumn);
  }

  const rows = purchases.flatMap((purchase) => {
    const items =
      purchase.items && purchase.items.length > 0 ? purchase.items : [null];
    return items.map((item) =>
      columns.map((column) => {
        if (column.valueGetter) {
          return column.valueGetter(purchase, item);
        }
        const formatter = purchaseValueFormatters[column.id];
        if (formatter) {
          return formatter(null, purchase);
        }
        const rawValue = (purchase as Record<string, unknown>)[column.id];
        return formatFallbackValue(rawValue);
      })
    );
  });

  const headers = columns.map((c) => c.label);

  return { headers, rows, columns };
}

type DownloadXlsxOpts = {
  headers: string[];
  rows: (string | number)[][];
  columns: ExportColumn[];
  rowsCount: number;
  format: PurchaseExportFormat;
  filename: string;
  sheetName: string;
};

async function downloadXlsxFromData(opts: DownloadXlsxOpts) {
  if (opts.headers.length === 0) {
    return;
  }

  const xlsxModule = await import("xlsx");
  const XLSX = xlsxModule.default ?? xlsxModule;

  const dataForSheet = [
    opts.headers,
    ...opts.rows.map((row) =>
      row.map((cell, index) => {
        const columnId = opts.columns[index].id;
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
    opts.columns.map((column, index) => ({ id: column.id, index })),
    opts.rowsCount
  );

  const estimatedWidths = opts.columns.map((column, columnIndex) => {
    const override = columnWidthOverrides[column.id];
    if (override) {
      return override;
    }

    const maxChars = Math.max(
      column.label.length,
      ...opts.rows.map((row) => {
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
  if (opts.format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  } else {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, opts.sheetName);
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const today = new Date().toISOString().split("T")[0];
  link.href = url;
  link.download = `${opts.filename}-${today}.${opts.format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getColumnIdsAndLabels(table: Table<PurchaseOrderWithSupplier>): {
  ids: string[];
  labels: Record<string, string>;
} {
  const visibleColumns = table
    .getVisibleLeafColumns()
    .filter((column) => column.id !== "actions" && column.id !== "select");

  const ids = visibleColumns.map((column) => column.id);
  const labels: Record<string, string> = {};
  for (const column of visibleColumns) {
    labels[column.id] = column.columnDef.meta?.label ?? column.id;
  }
  return { ids, labels };
}

type ExportVisibleOpts = {
  format: PurchaseExportFormat;
  table: Table<PurchaseOrderWithSupplier>;
  filename: string;
  sheetName: string;
};

async function exportVisible(opts: ExportVisibleOpts) {
  const { ids, labels } = getColumnIdsAndLabels(opts.table);

  const purchases = opts.table.getSortedRowModel().rows.map((r) => r.original);
  const { headers, rows, columns } = buildContentFromPurchases(
    purchases,
    ids,
    labels
  );

  await downloadXlsxFromData({
    headers,
    rows,
    columns,
    rowsCount: rows.length,
    format: opts.format,
    filename: opts.filename,
    sheetName: opts.sheetName,
  });
}

type ExportAllOpts = {
  format: PurchaseExportFormat;
  orgSlug: string;
  table: Table<PurchaseOrderWithSupplier>;
  filename: string;
  sheetName: string;
};

async function exportAll(opts: ExportAllOpts) {
  const allPurchases = await getPurchasesExportAction(opts.orgSlug);
  const { ids, labels } = getColumnIdsAndLabels(opts.table);
  const { headers, rows, columns } = buildContentFromPurchases(
    allPurchases,
    ids,
    labels
  );

  await downloadXlsxFromData({
    headers,
    rows,
    columns,
    rowsCount: rows.length,
    format: opts.format,
    filename: opts.filename,
    sheetName: opts.sheetName,
  });
}

export function PurchasesExportButton({
  orgSlug,
  table,
  filename = "compras",
  sheetName = "Compras",
}: PurchasesExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async (
    format: PurchaseExportFormat,
    mode: "visible" | "all"
  ) => {
    setExporting(true);
    try {
      if (mode === "visible") {
        await exportVisible({ format, table, filename, sheetName });
      } else {
        await exportAll({ format, orgSlug, table, filename, sheetName });
      }
    } catch (error) {
      toast.error(
        "Error al exportar: " +
          (error instanceof Error ? error.message : "Error desconocido")
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={exporting} size="sm" variant="outline">
          <Download className="mr-2 h-4 w-4" />
          {exporting ? "Exportando..." : "Exportar"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => handleExport("csv", "visible")}>
          <FileText className="mr-2 h-4 w-4" />
          CSV (página actual)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => handleExport("xlsx", "visible")}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Excel (página actual)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => handleExport("csv", "all")}>
          <FileText className="mr-2 h-4 w-4" />
          CSV (todo)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => handleExport("xlsx", "all")}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Excel (todo)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
