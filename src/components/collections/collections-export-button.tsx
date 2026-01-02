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
import { formatCurrency, formatDateOnly } from "@/lib/format";
import type {
  PayableAccount,
  ReceivableAccount,
} from "@/modules/collections/types";

type CollectionRow = ReceivableAccount | PayableAccount;

type CollectionsExportButtonProps<TData extends CollectionRow> = {
  table: Table<TData>;
};

type ExportFormat = "csv" | "xlsx";

const statusLabels = {
  PENDING: "Pendiente",
  PARTIAL: "Parcial",
  PAID: "Pagado",
} as const;

const columnWidthOverrides: Partial<Record<string, number>> = {
  customer: 28,
  supplier: 28,
  invoice: 18,
  purchase_number: 18,
  created_at: 16,
  due_date: 16,
  status: 14,
  total_amount: 16,
  pending_balance: 16,
};

function isReceivable(row: CollectionRow): row is ReceivableAccount {
  return "customer" in row;
}

function formatDocument(row: CollectionRow): string {
  if (isReceivable(row)) {
    const saleNumber = row.sale?.sale_number;
    if (saleNumber !== null && saleNumber !== undefined) {
      return `Venta N° ${saleNumber}`;
    }
    const invoice = row.sale?.invoice_number;
    if (invoice) {
      return `Venta ${invoice}`;
    }
    return `Venta ${row.sales_order_id.slice(0, 8)}`;
  }

  const purchase = row.purchase?.purchase_number;
  if (purchase) {
    return purchase.toString().padStart(6, "0");
  }
  return `OC ${row.purchase_order_id.slice(0, 8)}`;
}

function formatFallbackValue(rawValue: unknown): string {
  return rawValue ? String(rawValue) : "—";
}

type ColumnFormatter = (rawValue: unknown, row: CollectionRow) => string;

const columnFormatters: Record<string, ColumnFormatter> = {
  customer: (_rawValue, row) =>
    isReceivable(row)
      ? row.customer.fantasy_name || row.customer.business_name || "—"
      : "—",
  supplier: (_rawValue, row) =>
    isReceivable(row) ? "—" : row.supplier.name || "—",
  invoice: (_rawValue, row) => formatDocument(row),
  purchase_number: (_rawValue, row) => formatDocument(row),
  created_at: (_rawValue, row) =>
    row.created_at ? formatDateOnly(row.created_at) : "—",
  due_date: (_rawValue, row) =>
    row.due_date ? formatDateOnly(row.due_date) : "—",
  status: (rawValue, row) => {
    const status = typeof rawValue === "string" ? rawValue : row.status;
    return statusLabels[status as keyof typeof statusLabels] ?? "—";
  },
  total_amount: (_rawValue, row) => formatCurrency(row.total_amount),
  pending_balance: (_rawValue, row) => formatCurrency(row.pending_balance),
};

function formatValue(
  columnId: string,
  rawValue: unknown,
  row: CollectionRow
): string {
  const formatter = columnFormatters[columnId];
  if (formatter) {
    return formatter(rawValue, row);
  }
  return formatFallbackValue(rawValue);
}

function buildExportContent<TData extends CollectionRow>(table: Table<TData>) {
  const visibleColumns = table
    .getVisibleLeafColumns()
    .filter((column) => column.id !== "actions");

  const columns = visibleColumns.map((column) => ({
    id: column.id,
    label: column.columnDef.meta?.label ?? column.id,
  }));

  const rows = table
    .getSortedRowModel()
    .rows.map((row) =>
      columns.map((column) =>
        formatValue(column.id, row.getValue(column.id), row.original)
      )
    );

  const headers = columns.map((column) => column.label);

  return { headers, rows, columns };
}

async function downloadCollections<TData extends CollectionRow>(
  format: ExportFormat,
  table: Table<TData>
) {
  const { headers, rows, columns } = buildExportContent(table);
  if (headers.length === 0) {
    return;
  }

  const xlsxModule = await import("xlsx");
  const XLSX = xlsxModule.default ?? xlsxModule;
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  const estimatedWidths = columns.map((column, columnIndex) => {
    const override = columnWidthOverrides[column.id];
    if (override) {
      return override;
    }

    const maxChars = Math.max(
      column.label.length,
      ...rows.map((row) => row[columnIndex]?.length ?? 0)
    );

    // Extra padding to leave noticeable space between columns.
    const baseWidth = Math.min(Math.max(maxChars + 4, 12), 42);
    return baseWidth;
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

export function CollectionsExportButton<TData extends CollectionRow>({
  table,
}: CollectionsExportButtonProps<TData>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => downloadCollections("csv", table)}>
          <FileText className="mr-2 h-4 w-4" />
          Exportar CSV
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => downloadCollections("xlsx", table)}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Exportar Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
