"use client";

import type { Table } from "@tanstack/react-table";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";
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
import {
  getPayablesExportAction,
  getReceivablesExportAction,
} from "@/modules/collections/actions/get-collections-export.action";
import type {
  PayableAccount,
  ReceivableAccount,
} from "@/modules/collections/types";

type CollectionRow = ReceivableAccount | PayableAccount;

type CollectionsExportButtonProps<TData extends CollectionRow> = {
  table: Table<TData>;
  variant: "receivable" | "payable";
  orgSlug: string;
};

type ExportFormat = "csv" | "xlsx";

type CollectionStatus = "PENDING" | "PARTIAL" | "PAID";
type CollectionItem = NonNullable<CollectionRow["items"]>[number];

const columnWidthOverrides: Partial<Record<string, number>> = {
  customer: 28,
  supplier: 28,
  invoice: 18,
  purchase_number: 18,
  created_at: 16,
  dispatched_at: 16,
  due_date: 16,
  payment_date: 16,
  status: 14,
  total_amount: 16,
  pending_balance: 16,
  supplier_name: 24,
  product_name: 26,
  units: 12,
  kilograms: 10,
  subtotal: 16,
};

function isReceivable(row: CollectionRow): row is ReceivableAccount {
  return "customer" in row;
}

function formatDocument(row: CollectionRow): string {
  if (isReceivable(row)) {
    const invoiceNumber = row.sale?.invoice_number;
    if (invoiceNumber !== null && invoiceNumber !== undefined) {
      return `Factura N° ${invoiceNumber}`;
    }
    const remittance = row.sale?.remittance_number;
    if (remittance) {
      return `Remito N° ${remittance}`;
    }
    return `Venta ${row.sales_order_id.slice(0, 8)}`;
  }

  const purchase = row.purchase?.purchase_number;
  if (purchase) {
    return purchase.toString().padStart(6, "0");
  }
  return `OC ${row.purchase_order_id.slice(0, 8)}`;
}

function formatFallbackValue(rawValue: unknown): string | number {
  if (typeof rawValue === "number") {
    return rawValue;
  }
  return rawValue ? String(rawValue) : "—";
}

type ColumnFormatter = (
  rawValue: unknown,
  row: CollectionRow
) => string | number;

const columnFormatters: Record<string, ColumnFormatter> = {
  customer: (_rawValue, row) =>
    isReceivable(row)
      ? row.customer.fantasy_name || row.customer.business_name || "—"
      : "—",
  supplier: (_rawValue, row) =>
    isReceivable(row) ? "—" : row.supplier.name || "—",
  invoice: (_rawValue, row) => formatDocument(row),
  purchase_number: (_rawValue, row) => formatDocument(row),
  created_at: (_rawValue, row) => formatExportDate(row.created_at),
  dispatched_at: (_rawValue, row) =>
    isReceivable(row) ? formatExportDate(row.sale?.dispatched_at) : "—",
  due_date: (_rawValue, row) => formatExportDate(row.due_date),
  payment_date: (_rawValue, row) => {
    const status = row.status;
    const lastPaymentDate = row.last_payment_date;
    if (status === "PENDING" || !lastPaymentDate) {
      return "—";
    }
    return formatExportDate(lastPaymentDate);
  },
  status: (rawValue, row) => {
    const status = (
      typeof rawValue === "string" ? rawValue : row.status
    ) as CollectionStatus;
    return exportStatusLabels[status] ?? "—";
  },
  total_amount: (_rawValue, row) => formatExportCurrency(row.total_amount),
  pending_balance: (_rawValue, row) =>
    formatExportCurrency(row.pending_balance),
};

type ExportColumn = {
  id: string;
  label: string;
  valueGetter?: (
    row: CollectionRow,
    item?: CollectionItem | null
  ) => string | number;
};

function calculateReceivableSubtotal(row: CollectionRow): number | "" {
  if (!isReceivable(row)) {
    return "";
  }

  const base = Number(row.sale?.sub_total ?? 0);
  const discount = Number(row.sale?.global_discount_amount ?? 0);
  const safeBase = Number.isFinite(base) ? base : 0;
  const safeDiscount = Number.isFinite(discount) ? discount : 0;

  return Number((safeBase - safeDiscount).toFixed(2));
}

function getVisibleExportColumns<TData extends CollectionRow>(
  table: Table<TData>
): ExportColumn[] {
  return table
    .getVisibleLeafColumns()
    .filter((column) => column.id !== "actions")
    .map((column) => ({
      id: column.id,
      label: column.columnDef.meta?.label ?? column.id,
    }));
}

function getItemColumns(columns: ExportColumn[]): ExportColumn[] {
  const hasSupplierColumn = columns.some((c) => c.id === "supplier");
  return [
    ...(hasSupplierColumn
      ? []
      : [
          {
            id: "supplier_name",
            label: "Proveedor",
            valueGetter: (_: CollectionRow, item?: CollectionItem | null) =>
              item?.supplierName ?? "—",
          },
        ]),
    {
      id: "product_name",
      label: "Artículo",
      valueGetter: (_: CollectionRow, item?: CollectionItem | null) =>
        item?.productName ?? "—",
    },
    {
      id: "units",
      label: "Unidades",
      valueGetter: (_: CollectionRow, item?: CollectionItem | null) =>
        item?.units !== null && item?.units !== undefined ? item.units : "",
    },
    {
      id: "kilograms",
      label: "Kg",
      valueGetter: (_: CollectionRow, item?: CollectionItem | null) =>
        item?.kilograms !== null && item?.kilograms !== undefined
          ? item.kilograms
          : "",
    },
    {
      id: "subtotal",
      label: "Subtotal",
      valueGetter: (row: CollectionRow) => calculateReceivableSubtotal(row),
    },
  ];
}

function reorderColumns(allColumns: ExportColumn[]) {
  const subtotalIndex = allColumns.findIndex((c) => c.id === "subtotal");
  const totalIndex = allColumns.findIndex((c) => c.id === "total_amount");
  if (subtotalIndex > -1 && totalIndex > -1 && subtotalIndex > totalIndex) {
    const [subtotalColumn] = allColumns.splice(subtotalIndex, 1);
    allColumns.splice(totalIndex, 0, subtotalColumn);
  }
}

function buildHeadersAndRows(
  allColumns: ExportColumn[],
  rows: CollectionRow[]
): { headers: string[]; rows: (string | number)[][] } {
  const headers = allColumns.map((c) => c.label);

  const dataRows = rows.flatMap((row) => {
    const items = row.items && row.items.length > 0 ? row.items : [null];
    return items.map((item) =>
      allColumns.map((column) =>
        column.valueGetter
          ? column.valueGetter(row, item)
          : formatRowValue(column.id, row)
      )
    );
  });

  return { headers, rows: dataRows };
}

function formatRowValue(columnId: string, row: CollectionRow): string | number {
  const formatter = columnFormatters[columnId];
  if (formatter) {
    return formatter(null, row);
  }
  return formatFallbackValue((row as Record<string, unknown>)[columnId]);
}

type BuildResult = ReturnType<typeof buildHeadersAndRows>;

async function downloadXlsx(
  allColumns: ExportColumn[],
  { headers, rows }: BuildResult,
  format: ExportFormat
) {
  if (headers.length === 0) {
    return;
  }

  const xlsxModule = await import("xlsx");
  const XLSX = xlsxModule.default ?? xlsxModule;

  const dataForSheet = [
    headers,
    ...rows.map((row) =>
      row.map((cell, index) => {
        const columnId = allColumns[index].id;
        if (
          ["total_amount", "pending_balance", "subtotal"].includes(columnId) &&
          typeof cell === "string" &&
          cell !== "—"
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
    allColumns.map((col, index) => ({ id: col.id, index })),
    rows.length
  );

  const estimatedWidths = allColumns.map((column, columnIndex) => {
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

    return Math.min(Math.max(maxChars + 4, 12), 42);
  });

  worksheet["!cols"] = estimatedWidths.map((wch) => ({ wch }));

  let blob: Blob;
  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  } else {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Cobranzas");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const today = new Date().toISOString().split("T")[0];
  link.href = url;
  link.download = `cobranzas-${today}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function downloadVisible<TData extends CollectionRow>(
  format: ExportFormat,
  table: Table<TData>
) {
  const columns = getVisibleExportColumns(table);
  const itemColumns = getItemColumns(columns);
  const allColumns = [...columns, ...itemColumns];
  reorderColumns(allColumns);

  const rows = table.getSortedRowModel().rows.map((r) => r.original);
  const result = buildHeadersAndRows(allColumns, rows);
  await downloadXlsx(allColumns, result, format);
}

async function downloadAll<TData extends CollectionRow>(
  format: ExportFormat,
  table: Table<TData>,
  orgSlug: string,
  variant: "receivable" | "payable"
) {
  const data =
    variant === "receivable"
      ? await getReceivablesExportAction(orgSlug)
      : await getPayablesExportAction(orgSlug);

  const columns = getVisibleExportColumns(table);
  const itemColumns = getItemColumns(columns);
  const allColumns = [...columns, ...itemColumns];
  reorderColumns(allColumns);

  const result = buildHeadersAndRows(allColumns, data);
  await downloadXlsx(allColumns, result, format);
}

export function CollectionsExportButton<TData extends CollectionRow>({
  table,
  variant,
  orgSlug,
}: CollectionsExportButtonProps<TData>) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async (
    format: ExportFormat,
    mode: "visible" | "all"
  ) => {
    setExporting(true);
    try {
      if (mode === "visible") {
        await downloadVisible(format, table);
      } else {
        await downloadAll(format, table, orgSlug, variant);
      }
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
