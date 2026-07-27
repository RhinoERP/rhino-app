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
import { getCustomersExportAction } from "@/modules/customers/actions/get-customers-export.action";
import type { Customer } from "@/modules/customers/types";

type ClientesExportButtonProps = {
  orgSlug: string;
  table: Table<Customer>;
};

function getRowValue(
  row: Record<string, unknown>,
  column: {
    id: string;
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

export function ClientesExportButton({
  orgSlug,
  table,
}: ClientesExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async (
    format: "csv" | "xlsx",
    mode: "visible" | "all"
  ) => {
    setExporting(true);
    try {
      const visibleColumns = table
        .getVisibleLeafColumns()
        .filter((col) => col.id !== "actions" && col.id !== "select");

      const headers = visibleColumns.map(
        (col) => col.columnDef.meta?.label ?? col.id
      );

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
          filename: "clientes",
          sheetName: "Clientes",
        });
      } else {
        const data = await getCustomersExportAction(orgSlug);
        const rows = data.map((row) =>
          visibleColumns.map((col) =>
            getRowValue(
              row as unknown as Record<string, unknown>,
              col.columnDef as {
                id: string;
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
          filename: "clientes",
          sheetName: "Clientes",
        });
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
