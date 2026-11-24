"use client";

import type { Table } from "@tanstack/react-table";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
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
import { getChessHistoricalSalesExportAction } from "@/modules/sales/historical/actions/get-chess-historical-sales-export.action";
import type {
  ChessHistoricalSalesDocument,
  ChessHistoricalSalesExportFilters,
} from "@/modules/sales/historical/service/chess-historical-sales.service";

type HistoricalSalesExportButtonProps = {
  orgSlug: string;
  table: Table<ChessHistoricalSalesDocument>;
  filters: ChessHistoricalSalesExportFilters;
};

type ExportFormat = "csv" | "xlsx";
type ExportScope = "page" | "filtered" | "all";

function formatDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("es-AR", {
    timeZone: "UTC",
  });
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
  }).format(Number(value));
}

function getCustomerName(document: ChessHistoricalSalesDocument) {
  return (
    document.customer?.fantasy_name ||
    document.customer?.business_name ||
    `Cliente CHESS ${document.customer_chess_code ?? "sin vincular"}`
  );
}

function getDocumentClass(document: ChessHistoricalSalesDocument) {
  let documentType = "Venta";
  if (document.document_class === "CREDIT_NOTE") {
    documentType = "Nota de crédito";
  } else if (document.document_class === "DEBIT_NOTE") {
    documentType = "Nota de débito";
  }
  return `${document.is_fiscal ? "Fiscal" : "No fiscal"} · ${documentType}`;
}

function getSettlementStatus(document: ChessHistoricalSalesDocument) {
  if (document.cancelled) {
    return "Anulado";
  }
  if (document.settlement_status === "PAID") {
    return "Pagado";
  }
  if (document.settlement_status === "OPEN") {
    return "Abierto";
  }
  if (document.settlement_status === "PARTIAL") {
    return "Parcial";
  }
  if (document.settlement_status === "NOT_APPLICABLE") {
    return "No aplica";
  }
  return "Saldo sin conciliar";
}

function getDocumentNumber(document: ChessHistoricalSalesDocument) {
  return (
    document.printed_number ||
    `${document.document_letter} ${document.document_series}-${document.document_number}`
  );
}

function getExportRows(documents: ChessHistoricalSalesDocument[]) {
  return documents.map((document) => [
    formatDate(document.document_date),
    getDocumentNumber(document),
    document.document_code,
    document.document_name,
    getCustomerName(document),
    getDocumentClass(document),
    formatAmount(Number(document.total_amount) * document.revenue_sign),
    getSettlementStatus(document),
  ]);
}

async function downloadExport(
  documents: ChessHistoricalSalesDocument[],
  format: ExportFormat,
  scope: ExportScope
) {
  const headers = [
    "Fecha",
    "Comprobante",
    "Código CHESS",
    "Descripción",
    "Cliente",
    "Clasificación",
    "Importe",
    "Estado de cuenta",
  ];
  const rows = getExportRows(documents);
  const xlsxModule = await import("xlsx");
  const XLSX = xlsxModule.default ?? xlsxModule;
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  worksheet["!cols"] = headers.map((header, columnIndex) => {
    const maxLength = Math.max(
      header.length,
      ...rows.map((row) => String(row[columnIndex] ?? "").length)
    );
    return { wch: Math.min(Math.max(maxLength + 2, 10), 50) };
  });

  let blob: Blob;
  if (format === "csv") {
    blob = new Blob([XLSX.utils.sheet_to_csv(worksheet)], {
      type: "text/csv;charset=utf-8;",
    });
  } else {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Ventas históricas");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const today = new Date().toISOString().split("T")[0];
  link.href = url;
  link.download = `ventas-historicas-${scope}-${today}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function HistoricalSalesExportButton({
  orgSlug,
  table,
  filters,
}: HistoricalSalesExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async (format: ExportFormat, scope: ExportScope) => {
    setExporting(true);
    try {
      const documents =
        scope === "page"
          ? table.getRowModel().rows.map((row) => row.original)
          : await getChessHistoricalSalesExportAction(
              orgSlug,
              scope === "filtered" ? filters : {}
            );
      await downloadExport(documents, format, scope);
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
        <DropdownMenuItem onSelect={() => handleExport("csv", "page")}>
          <FileText className="mr-2 h-4 w-4" />
          CSV (página actual)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => handleExport("xlsx", "page")}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Excel (página actual)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => handleExport("csv", "filtered")}>
          <FileText className="mr-2 h-4 w-4" />
          CSV (todo lo filtrado)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => handleExport("xlsx", "filtered")}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Excel (todo lo filtrado)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => handleExport("csv", "all")}>
          <FileText className="mr-2 h-4 w-4" />
          CSV (todo el histórico)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => handleExport("xlsx", "all")}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Excel (todo el histórico)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
