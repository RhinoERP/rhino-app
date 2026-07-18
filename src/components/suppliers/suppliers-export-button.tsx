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
import { getSuppliersExportAction } from "@/modules/suppliers/actions/get-suppliers-export.action";
import type { Supplier } from "@/modules/suppliers/service/suppliers.service";

type SuppliersExportButtonProps = {
  orgSlug: string;
  table: Table<Supplier>;
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const today = new Date().toISOString().split("T")[0];
  link.href = url;
  link.download = `${filename}-${today}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

type DownloadOptions = {
  headers: string[];
  rows: string[][];
  format: "csv" | "xlsx";
  filename: string;
  sheetName: string;
};

async function downloadXlsx(opts: DownloadOptions) {
  if (opts.headers.length === 0) {
    return;
  }

  const xlsxModule = await import("xlsx");
  const XLSX = xlsxModule.default ?? xlsxModule;
  const worksheet = XLSX.utils.aoa_to_sheet([opts.headers, ...opts.rows]);

  const colWidths = opts.headers.map((header, colIdx) => {
    const maxLen = Math.max(
      header.length,
      ...opts.rows.map((row) => row[colIdx]?.length ?? 0)
    );
    return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
  });
  worksheet["!cols"] = colWidths;

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

  await downloadBlob(blob, opts.filename);
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

function getCellValue(row: Supplier, columnId: string): string {
  switch (columnId) {
    case "name":
      return row.name ?? "";
    case "cuit":
      return row.cuit ?? "";
    case "phone":
      return row.phone ?? "";
    case "contact_name":
      return row.contact_name ?? "";
    case "email":
      return row.email ?? "";
    case "address":
      return row.address ?? "";
    default:
      return "";
  }
}

async function exportVisible(
  format: "csv" | "xlsx",
  table: Table<Supplier>,
  filename: string,
  sheetName: string
) {
  const visibleColumns = table
    .getVisibleLeafColumns()
    .filter((col) => col.id !== "select" && col.id !== "actions");

  const headers = visibleColumns.map(
    (col) => col.columnDef.meta?.label ?? col.id
  );

  const rows = table
    .getSortedRowModel()
    .rows.map((r) =>
      visibleColumns.map((col) => formatCellValue(r.getValue(col.id)))
    );

  await downloadXlsx({ headers, rows, format, filename, sheetName });
}

async function exportAll(format: "csv" | "xlsx", orgSlug: string) {
  const data = await getSuppliersExportAction(orgSlug);
  const headers = [
    "Proveedor",
    "CUIT",
    "Teléfono",
    "Contacto",
    "Email",
    "Dirección",
  ];
  const columnIds = [
    "name",
    "cuit",
    "phone",
    "contact_name",
    "email",
    "address",
  ];

  const rows = data.map((row) =>
    columnIds.map((colId) => getCellValue(row, colId))
  );

  await downloadXlsx({
    headers,
    rows,
    format,
    filename: "proveedores",
    sheetName: "Proveedores",
  });
}

export function SuppliersExportButton({
  orgSlug,
  table,
}: SuppliersExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async (
    format: "csv" | "xlsx",
    mode: "visible" | "all"
  ) => {
    setExporting(true);
    try {
      if (mode === "visible") {
        await exportVisible(format, table, "proveedores", "Proveedores");
      } else {
        await exportAll(format, orgSlug);
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
