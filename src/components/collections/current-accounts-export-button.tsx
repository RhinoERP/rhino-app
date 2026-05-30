"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateOnly } from "@/lib/format";
import type { CustomerGroup, SupplierGroup } from "./current-accounts";

type Group = CustomerGroup | SupplierGroup;

type CurrentAccountsExportButtonProps = {
  groups: Group[];
  orgSlug: string;
  type: "receivable" | "payable";
};

type ExportFormat = "csv" | "xlsx";

const columnWidthOverrides = [22, 16, 16, 14, 16, 16] as const;

type CellValue = string | number;

const formatNumberCell = (value: number | null | undefined): number | "" => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "";
  }
  return Math.round(value * 100) / 100;
};

function buildReceivableRows(groups: Group[]): CellValue[][] {
  const rows: CellValue[][] = [];

  for (const group of groups as CustomerGroup[]) {
    rows.push([group.name]);
    rows.push([
      "Documento",
      "Vendedor",
      "Vencimiento",
      "Total factura",
      "Pendiente",
    ]);

    for (const item of group.items) {
      rows.push([
        item.label,
        item.sellerName ?? "",
        item.dueDate ? formatDateOnly(item.dueDate) : "—",
        formatNumberCell(item.total),
        formatNumberCell(item.pending),
      ]);
    }

    rows.push([]);
  }

  return rows;
}

function buildPayableRows(groups: Group[]): CellValue[][] {
  const rows: CellValue[][] = [];

  for (const group of groups) {
    rows.push([group.name]);
    rows.push(["Documento", "Vencimiento", "Total factura", "Pendiente"]);

    for (const item of group.items) {
      rows.push([
        item.label,
        item.dueDate ? formatDateOnly(item.dueDate) : "—",
        formatNumberCell(item.total),
        formatNumberCell(item.pending),
      ]);
    }

    rows.push([]);
  }

  return rows;
}

function buildFlatRows(
  groups: Group[],
  type: "receivable" | "payable"
): CellValue[][] {
  return type === "receivable"
    ? buildReceivableRows(groups)
    : buildPayableRows(groups);
}

function estimateWidths(rows: CellValue[][]) {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, idx) => {
      const current = widths[idx] ?? 0;
      const len = cell === null || cell === undefined ? 0 : String(cell).length;
      widths[idx] = Math.max(current, len);
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
  const rows = buildFlatRows(groups, type);

  if (rows.length <= 1) {
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
