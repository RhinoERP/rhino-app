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
import { getOrdersExportAction } from "@/modules/orders/actions/get-orders-export.action";
import type { OrderPaginatedItem } from "@/modules/orders/types";

type OrdersExportButtonProps = {
  orgSlug: string;
  table: Table<OrderPaginatedItem>;
};

function formatCellValue(value: unknown): string {
  if (typeof value === "number") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString().split("T")[0];
  }
  if (typeof value === "boolean") {
    return value ? "Sí" : "No";
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function getRowValue(
  row: Record<string, unknown>,
  column: {
    accessorKey?: string;
    accessorFn?: (r: Record<string, unknown>) => unknown;
  }
): string {
  if (column.accessorFn) {
    return formatCellValue(column.accessorFn(row));
  }
  if (column.accessorKey) {
    return formatCellValue(row[column.accessorKey]);
  }
  return "";
}

type DownloadOpts = {
  headers: string[];
  rows: string[][];
  format: "csv" | "xlsx";
  filename: string;
  sheetName: string;
};

async function downloadXlsx({
  headers,
  rows,
  format,
  filename,
  sheetName,
}: DownloadOpts) {
  if (headers.length === 0) {
    return;
  }

  const xlsxModule = await import("xlsx");
  const XLSX = xlsxModule.default ?? xlsxModule;
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  const colWidths = headers.map((header, colIdx) => {
    const maxLen = Math.max(
      header.length,
      ...rows.map((row) => row[colIdx]?.length ?? 0)
    );
    return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
  });
  worksheet["!cols"] = colWidths;

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

export function OrdersExportButton({
  orgSlug,
  table,
}: OrdersExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async (
    format: "csv" | "xlsx",
    mode: "visible" | "all"
  ) => {
    setExporting(true);
    try {
      const visibleColumns = table
        .getVisibleLeafColumns()
        .filter((col) => col.id !== "actions");

      const headers = visibleColumns.map((col) => {
        const label = col.columnDef.meta?.label;
        if (label) {
          return label;
        }
        return typeof col.columnDef.header === "string"
          ? col.columnDef.header
          : col.id;
      });

      if (mode === "visible") {
        const rows = table
          .getSortedRowModel()
          .rows.map((r) =>
            visibleColumns.map((col) => formatCellValue(r.getValue(col.id)))
          );
        await downloadXlsx({
          headers,
          rows,
          format,
          filename: "pedidos",
          sheetName: "Pedidos",
        });
      } else {
        const data = await getOrdersExportAction(orgSlug);
        const rows = data.map((row) =>
          visibleColumns.map((col) =>
            getRowValue(
              row as unknown as Record<string, unknown>,
              col.columnDef as {
                accessorKey?: string;
                accessorFn?: (r: Record<string, unknown>) => unknown;
              }
            )
          )
        );
        await downloadXlsx({
          headers,
          rows,
          format,
          filename: "pedidos",
          sheetName: "Pedidos",
        });
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
