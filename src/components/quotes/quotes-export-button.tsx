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
import { formatCurrency, formatDate } from "@/lib/format";
import type { QuoteWithCustomer } from "@/modules/quotes/actions/get-quotes.action";
import { getQuotesExportAction } from "@/modules/quotes/actions/get-quotes-export.action";

type QuotesExportButtonProps = {
  orgSlug: string;
  table: Table<QuoteWithCustomer>;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  SENT: "Enviado",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  CONVERTED: "Convertido",
  CANCELLED: "Cancelado",
};

const EXPORT_COLUMNS = [
  { id: "customer", label: "Cliente" },
  { id: "created_at", label: "Fecha" },
  { id: "items_count", label: "Artículos" },
  { id: "total_amount", label: "Total" },
  { id: "status", label: "Estado" },
];

function getCellValue(row: QuoteWithCustomer, columnId: string): string {
  switch (columnId) {
    case "customer":
      return row.customers?.fantasy_name || row.customers?.business_name || "";
    case "created_at":
      return row.created_at
        ? formatDate(row.created_at, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "";
    case "items_count":
      return (row.quote_items ?? [])
        .reduce((sum, item) => sum + (item.quantity ?? 0), 0)
        .toString();
    case "total_amount":
      return formatCurrency(row.total_amount, row.currency);
    case "status":
      return STATUS_LABELS[row.status] ?? row.status;
    default:
      return "";
  }
}

async function exportVisible(
  format: "csv" | "xlsx",
  table: Table<QuoteWithCustomer>,
  filename: string,
  sheetName: string
) {
  const headers = EXPORT_COLUMNS.map((col) => col.label);

  const rows = table
    .getSortedRowModel()
    .rows.map((r) =>
      EXPORT_COLUMNS.map((col) => formatCellValue(r.getValue(col.id)))
    );

  await downloadXlsx({ headers, rows, format, filename, sheetName });
}

async function exportAll(format: "csv" | "xlsx", orgSlug: string) {
  const data = await getQuotesExportAction(orgSlug);
  const headers = EXPORT_COLUMNS.map((col) => col.label);

  const rows = data.map((row) =>
    EXPORT_COLUMNS.map((col) => getCellValue(row, col.id))
  );

  await downloadXlsx({
    headers,
    rows,
    format,
    filename: "presupuestos",
    sheetName: "Presupuestos",
  });
}

export function QuotesExportButton({
  orgSlug,
  table,
}: QuotesExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async (
    format: "csv" | "xlsx",
    mode: "visible" | "all"
  ) => {
    setExporting(true);
    try {
      if (mode === "visible") {
        await exportVisible(format, table, "presupuestos", "Presupuestos");
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
