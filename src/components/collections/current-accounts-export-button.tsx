"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import type { CustomerGroup, SupplierGroup } from "./current-accounts";

type Group = CustomerGroup | SupplierGroup;

type CurrentAccountsExportButtonProps = {
  groups: Group[];
  type: "receivable" | "payable";
};

type ExportFormat = "csv" | "xlsx";

const statusLabels: Record<string, string> = {
  PENDING: "Pendiente",
  PARTIAL: "Parcial",
  PAID: "Pagado",
};

const columnWidthOverrides = [22, 16, 14, 16, 16] as const;

function buildRows(groups: Group[]) {
  const rows: string[][] = [];

  for (const group of groups) {
    const pendingSum = group.items.reduce(
      (sum, item) => sum + (item.pending ?? 0),
      0
    );

    rows.push([group.name, "", "Pendiente", "", formatCurrency(pendingSum)]);

    if ("fantasyName" in group && group.fantasyName) {
      rows.push([group.fantasyName, "", "", "", ""]);
    }

    rows.push(["Documento", "Vencimiento", "Estado", "Total", "Pendiente"]);

    for (const item of group.items) {
      rows.push([
        item.label,
        item.dueDate ? formatDateOnly(item.dueDate) : "—",
        statusLabels[item.status] ?? "—",
        formatCurrency(item.total),
        formatCurrency(item.pending),
      ]);
    }

    rows.push(["", "", "", "", ""]);
  }

  return rows;
}

function estimateWidths(rows: string[][]) {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, idx) => {
      const current = widths[idx] ?? 0;
      widths[idx] = Math.max(current, cell?.length ?? 0);
    });
  }

  return widths.map((len, idx) => {
    const override = columnWidthOverrides[idx];
    if (override) {
      return override;
    }
    return Math.min(Math.max(len + 4, 12), 42);
  });
}

async function downloadCurrentAccounts(
  format: ExportFormat,
  groups: Group[],
  type: "receivable" | "payable"
) {
  const rows = buildRows(groups);
  if (!rows.length) {
    return;
  }

  const xlsxModule = await import("xlsx");
  const XLSX = xlsxModule.default ?? xlsxModule;
  const worksheet = XLSX.utils.aoa_to_sheet(rows);

  const widths = estimateWidths(rows);
  worksheet["!cols"] = widths.map((wch) => ({ wch }));

  let blob: Blob;
  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  } else {
    const workbook = XLSX.utils.book_new();
    const sheetName = type === "receivable" ? "CC Clientes" : "CC Proveedores";
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const today = new Date().toISOString().split("T")[0];
  const fileType = type === "receivable" ? "cc-clientes" : "cc-proveedores";
  link.href = url;
  link.download = `${fileType}-${today}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function CurrentAccountsExportButton({
  groups,
  type,
}: CurrentAccountsExportButtonProps) {
  const hasData = groups.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={!hasData} size="sm" variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={!hasData}
          onSelect={() => downloadCurrentAccounts("csv", groups, type)}
        >
          <FileText className="mr-2 h-4 w-4" />
          Exportar CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!hasData}
          onSelect={() => downloadCurrentAccounts("xlsx", groups, type)}
        >
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Exportar Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
