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

type DataTableExportButtonProps<TData> = {
  table: Table<TData>;
  filename?: string;
  sheetName?: string;
};

type ExportFormat = "csv" | "xlsx";

async function exportTable<TData>(
  format: ExportFormat,
  table: Table<TData>,
  filename: string,
  sheetName: string
) {
  const visibleColumns = table
    .getVisibleLeafColumns()
    .filter((column) => column.id !== "select" && column.id !== "actions");

  const headers = visibleColumns.map(
    (column) => column.columnDef.meta?.label ?? column.id
  );

  const rows = table.getSortedRowModel().rows.map((row) =>
    visibleColumns.map((column) => {
      const value = row.getValue(column.id);

      // Handle numeric values - export as raw numbers
      if (typeof value === "number") {
        return value.toString();
      }

      // Handle dates
      if (value instanceof Date) {
        return value.toISOString().split("T")[0];
      }

      // Handle booleans
      if (typeof value === "boolean") {
        return value ? "Sí" : "No";
      }

      // Handle null/undefined
      if (value === null || value === undefined) {
        return "";
      }

      // Convert everything else to string
      return String(value);
    })
  );

  if (headers.length === 0) {
    return;
  }

  const xlsxModule = await import("xlsx");
  const XLSX = xlsxModule.default ?? xlsxModule;
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Auto-size columns
  const colWidths = headers.map((header, colIndex) => {
    const maxLength = Math.max(
      header.length,
      ...rows.map((row) => (row[colIndex]?.length ?? 0))
    );
    return { wch: Math.min(Math.max(maxLength + 2, 10), 50) };
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

export function DataTableExportButton<TData>({
  table,
  filename = "export",
  sheetName = "Datos",
}: DataTableExportButtonProps<TData>) {
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
          onSelect={() => exportTable("csv", table, filename, sheetName)}
        >
          <FileText className="mr-2 h-4 w-4" />
          Exportar CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => exportTable("xlsx", table, filename, sheetName)}
        >
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Exportar Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
