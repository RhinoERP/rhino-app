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
  PayableAccount,
  ReceivableAccount,
} from "@/modules/collections/types";

type CollectionRow = ReceivableAccount | PayableAccount;

type CollectionsExportButtonProps<TData extends CollectionRow> = {
  table: Table<TData>;
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
  due_date: (_rawValue, row) => formatExportDate(row.due_date),
  payment_date: (_rawValue, row) => {
    const status = row.status;
    const lastPaymentDate = row.last_payment_date;
    // Si el estado es "PENDING" o no hay fecha de pago, mostrar guion
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

function formatValue(
  columnId: string,
  rawValue: unknown,
  row: CollectionRow
): string | number {
  const formatter = columnFormatters[columnId];
  if (formatter) {
    return formatter(rawValue, row);
  }
  return formatFallbackValue(rawValue);
}

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

type ExportColumn = {
  id: string;
  label: string;
  valueGetter?: (
    row: CollectionRow,
    item?: CollectionItem | null
  ) => string | number;
};

function buildExportContent<TData extends CollectionRow>(table: Table<TData>) {
  const visibleColumns = table
    .getVisibleLeafColumns()
    .filter((column) => column.id !== "actions");

  const columns: ExportColumn[] = visibleColumns.map((column) => ({
    id: column.id,
    label: column.columnDef.meta?.label ?? column.id,
  }));

  const hasSupplierColumn = columns.some((column) => column.id === "supplier");
  const itemColumns: ExportColumn[] = [
    ...(hasSupplierColumn
      ? []
      : [
          {
            id: "supplier_name",
            label: "Proveedor",
            valueGetter: (_row: CollectionRow, item?: CollectionItem | null) =>
              item?.supplierName ?? "—",
          },
        ]),
    {
      id: "product_name",
      label: "Artículo",
      valueGetter: (_row: CollectionRow, item?: CollectionItem | null) =>
        item?.productName ?? "—",
    },
    {
      id: "units",
      label: "Unidades",
      valueGetter: (_row: CollectionRow, item?: CollectionItem | null) =>
        item?.units !== null && item?.units !== undefined ? item.units : "",
    },
    {
      id: "kilograms",
      label: "Kg",
      valueGetter: (_row: CollectionRow, item?: CollectionItem | null) =>
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
    const items =
      row.original.items && row.original.items.length > 0
        ? row.original.items
        : [null];
    return items.map((item) =>
      allColumns.map((column) =>
        column.valueGetter
          ? column.valueGetter(row.original, item)
          : formatValue(column.id, row.getValue(column.id), row.original)
      )
    );
  });

  const headers = allColumns.map((column) => column.label);

  return { headers, rows, columns: allColumns };
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

  // Convert data to worksheet, treating currency columns as numbers
  const dataForSheet = [
    headers,
    ...rows.map((row) =>
      row.map((cell, index) => {
        const columnId = columns[index].id;
        // Convert currency strings back to numbers for Excel
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

  // Apply currency formatting to monetary columns
  applyCurrencyFormat(
    worksheet,
    columns.map((col, index) => ({ id: col.id, index })),
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
