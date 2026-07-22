"use client";

import type { ColumnDef, Table } from "@tanstack/react-table";
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
import { getCreditNotesExportAction } from "@/modules/credit-notes/actions/get-credit-notes-export.action";
import type { CreditNote } from "@/modules/credit-notes/types";

type CreditNotesExportButtonProps = {
  orgSlug: string;
  table: Table<CreditNote>;
};

function getRowValue(
  row: Record<string, unknown>,
  column: ColumnDef<CreditNote>
): string {
  const col = column as ColumnDef<CreditNote> & {
    accessorKey?: string;
    accessorFn?: (row: Record<string, unknown>) => unknown;
  };

  if (col.accessorFn) {
    const val = col.accessorFn(row);
    return formatCellValue(val);
  }

  if (col.accessorKey) {
    const val = row[col.accessorKey];
    return formatCellValue(val);
  }

  return "";
}

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

type ExportOpts = {
  format: "csv" | "xlsx";
  table: Table<CreditNote>;
  filename: string;
  sheetName: string;
};

type ExportAllOpts = ExportOpts & {
  orgSlug: string;
};

async function exportVisible({
  format,
  table,
  filename,
  sheetName,
}: ExportOpts) {
  const visibleColumns = table
    .getVisibleLeafColumns()
    .filter((col) => col.id !== "actions" && col.id !== "select");

  const headers = visibleColumns.map(
    (col) => col.columnDef.header?.toString() ?? col.id
  );

  const rows = table
    .getSortedRowModel()
    .rows.map((r) =>
      visibleColumns.map((col) => formatCellValue(r.getValue(col.id)))
    );

  await downloadXlsx({ headers, rows, format, filename, sheetName });
}

async function exportAll({
  format,
  orgSlug,
  table,
  filename,
  sheetName,
}: ExportAllOpts) {
  const data = await getCreditNotesExportAction(orgSlug);
  const visibleColumns = table
    .getVisibleLeafColumns()
    .filter((col) => col.id !== "actions" && col.id !== "select");

  const headers = visibleColumns.map(
    (col) => col.columnDef.header?.toString() ?? col.id
  );

  const rows = data.map((row) =>
    visibleColumns.map((col) =>
      getRowValue(row as unknown as Record<string, unknown>, col.columnDef)
    )
  );

  await downloadXlsx({ headers, rows, format, filename, sheetName });
}

export function CreditNotesExportButton({
  orgSlug,
  table,
}: CreditNotesExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async (
    format: "csv" | "xlsx",
    mode: "visible" | "all"
  ) => {
    setExporting(true);
    try {
      const opts = {
        format,
        table,
        filename: "notas-de-credito",
        sheetName: "NC",
      };
      if (mode === "visible") {
        await exportVisible(opts);
      } else {
        await exportAll({ ...opts, orgSlug });
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
