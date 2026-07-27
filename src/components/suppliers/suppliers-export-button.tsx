"use client";

import {
  DownloadSimple as Download,
  FileXls as FileSpreadsheet,
  FileText,
} from "@phosphor-icons/react";
import type { Table } from "@tanstack/react-table";
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
import { downloadXlsx, formatCellValue } from "@/lib/download-utils";
import { getSuppliersExportAction } from "@/modules/suppliers/actions/get-suppliers-export.action";
import type { Supplier } from "@/modules/suppliers/service/suppliers.service";

type SuppliersExportButtonProps = {
  orgSlug: string;
  table: Table<Supplier>;
};

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
