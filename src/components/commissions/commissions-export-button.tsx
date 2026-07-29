"use client";

import {
  DownloadSimple as Download,
  FileXls as FileSpreadsheet,
  FileText,
} from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency } from "@/lib/format";
import { getCommissionsExportAction } from "@/modules/commissions/actions/get-commissions-export.action";
import type { CommissionSeller } from "@/modules/commissions/types";

type CommissionsExportButtonProps = {
  orgSlug: string;
  month?: string;
};

export function CommissionsExportButton({
  orgSlug,
  month,
}: CommissionsExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async (format: "csv" | "xlsx") => {
    setExporting(true);
    try {
      const data = await getCommissionsExportAction(orgSlug, month);
      const headers = [
        "Vendedor",
        "Comisión base",
        "Ventas",
        "Subtotal",
        "Comisión total",
      ];
      const rows = data.map((seller: CommissionSeller) => [
        seller.sellerName,
        `${seller.baseCommissionRate}%`,
        seller.saleCount.toString(),
        formatCurrency(seller.totalSubtotal),
        formatCurrency(seller.totalCommission),
      ]);

      const xlsxModule = await import("xlsx");
      const XLSX = xlsxModule.default ?? xlsxModule;
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

      const colWidths = headers.map((header, colIdx) => {
        const maxLen = Math.max(
          header.length,
          ...rows.map((row) => String(row[colIdx] ?? "").length)
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
        XLSX.utils.book_append_sheet(workbook, worksheet, "Comisiones");
        const buffer = XLSX.write(workbook, {
          bookType: "xlsx",
          type: "array",
        });
        blob = new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const today = new Date().toISOString().split("T")[0];
      link.href = url;
      link.download = `comisiones-${today}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(
        `Error al exportar: ${error instanceof Error ? error.message : "Error desconocido"}`
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
        <DropdownMenuItem onSelect={() => handleExport("csv")}>
          <FileText className="mr-2 h-4 w-4" />
          CSV
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => handleExport("xlsx")}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
