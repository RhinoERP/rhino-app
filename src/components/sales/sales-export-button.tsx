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
import {
  applyCurrencyFormat,
  exportInvoiceTypeLabels,
  exportStatusLabels,
  formatExportCurrency,
  formatExportDate,
} from "@/lib/export-utils";
import { getSalesExportAction } from "@/modules/sales/actions/get-sales-export.action";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";
import type { InvoiceType, SalesOrderStatus } from "@/modules/sales/types";
import { getCustomerDisplayName } from "./columns/sale-columns-all";

type SalesExportButtonProps = {
  table: Table<SalesOrderWithCustomer>;
  orgSlug: string;
};

type SalesExportFormat = "csv" | "xlsx";
type PaymentStatus = "PAID" | "PARTIAL" | "PENDING";
type SaleItem = NonNullable<SalesOrderWithCustomer["items"]>[number];

const columnWidthOverrides: Partial<Record<string, number>> = {
  sale_number: 10,
  customer: 28,
  seller: 22,
  sale_date: 14,
  expiration_date: 14,
  invoice_type: 16,
  status: 14,
  total_amount: 16,
  payment_status: 16,
  supplier_name: 24,
  product_name: 26,
  units: 12,
  kilograms: 10,
  subtotal: 14,
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  PAID: "Pagado",
  PARTIAL: "Parcial",
  PENDING: "Pendiente",
};

type ExportColumn = {
  id: string;
  label: string;
  valueGetter?: (
    sale: SalesOrderWithCustomer,
    item?: SaleItem | null
  ) => string | number;
};

function getPaymentStatus(sale: SalesOrderWithCustomer): PaymentStatus | null {
  const status = sale.receivable?.status as PaymentStatus | null | undefined;
  if (status === "PAID" || status === "PARTIAL" || status === "PENDING") {
    return status;
  }
  return null;
}

function formatFallbackValue(rawValue: unknown): string {
  return rawValue ? String(rawValue) : "—";
}

function formatInvoiceNumber(sale: SalesOrderWithCustomer): string {
  const fallback = sale.invoice_number ?? sale.sale_number;
  return fallback ? String(fallback) : "—";
}

function formatSellerName(sale: SalesOrderWithCustomer): string {
  const fallback = sale.seller?.name || sale.seller?.email;
  return fallback || "—";
}

type ColumnFormatter = (
  rawValue: unknown,
  sale: SalesOrderWithCustomer
) => string;

const columnFormatters: Record<string, ColumnFormatter> = {
  sale_number: (_rawValue, sale) => formatInvoiceNumber(sale),
  customer: (_rawValue, sale) => getCustomerDisplayName(sale),
  seller: (_rawValue, sale) => formatSellerName(sale),
  sale_date: (_rawValue, sale) => formatExportDate(sale.sale_date),
  expiration_date: (_rawValue, sale) => formatExportDate(sale.expiration_date),
  invoice_type: (rawValue, sale) => {
    const type = (
      typeof rawValue === "string" ? rawValue : sale.invoice_type
    ) as InvoiceType;
    return (
      exportInvoiceTypeLabels[type as keyof typeof exportInvoiceTypeLabels] ??
      "—"
    );
  },
  status: (rawValue, sale) => {
    const status = (
      typeof rawValue === "string" ? rawValue : sale.status
    ) as SalesOrderStatus;
    return exportStatusLabels[status as keyof typeof exportStatusLabels] ?? "—";
  },
  total_amount: (_rawValue, sale) => formatExportCurrency(sale.total_amount),
};

function formatValue(
  columnId: string,
  rawValue: unknown,
  sale: SalesOrderWithCustomer
): string {
  const formatter = columnFormatters[columnId];
  if (formatter) {
    return formatter(rawValue, sale);
  }
  return formatFallbackValue(rawValue);
}

function calculateSaleSubtotal(sale: SalesOrderWithCustomer): number | "" {
  const base = Number(sale.sub_total ?? 0);
  const discount = Number(sale.global_discount_amount ?? 0);
  const safeBase = Number.isFinite(base) ? base : 0;
  const safeDiscount = Number.isFinite(discount) ? discount : 0;

  return Number((safeBase - safeDiscount).toFixed(2));
}

function getVisibleExportColumns(
  table: Table<SalesOrderWithCustomer>
): ExportColumn[] {
  return table
    .getVisibleLeafColumns()
    .filter((column) => column.id !== "actions")
    .map((column) => ({
      id: column.id,
      label: column.columnDef.meta?.label ?? column.id,
    }));
}

function getExtraColumns(): ExportColumn[] {
  return [
    {
      id: "payment_status",
      label: "Estado Pago",
      valueGetter: (sale) => {
        const status = getPaymentStatus(sale);
        return status ? paymentStatusLabels[status] : "Pendiente";
      },
    },
    {
      id: "supplier_name",
      label: "Proveedor",
      valueGetter: (_sale, item) => item?.supplierName ?? "—",
    },
    {
      id: "product_name",
      label: "Artículo",
      valueGetter: (_sale, item) => item?.productName ?? "—",
    },
    {
      id: "units",
      label: "Unidades",
      valueGetter: (_sale, item) =>
        item?.units !== null && item?.units !== undefined ? item.units : "",
    },
    {
      id: "kilograms",
      label: "Kg",
      valueGetter: (_sale, item) =>
        item?.kilograms !== null && item?.kilograms !== undefined
          ? item.kilograms
          : "",
    },
    {
      id: "subtotal",
      label: "Subtotal",
      valueGetter: (sale) => calculateSaleSubtotal(sale),
    },
  ];
}

function reorderColumns(allColumns: ExportColumn[]) {
  const subtotalIndex = allColumns.findIndex((c) => c.id === "subtotal");
  const totalIndex = allColumns.findIndex((c) => c.id === "total_amount");
  if (subtotalIndex > -1 && totalIndex > -1 && subtotalIndex > totalIndex) {
    const [subtotalColumn] = allColumns.splice(subtotalIndex, 1);
    allColumns.splice(totalIndex, 0, subtotalColumn);
  }
}

function buildFromSales(
  allColumns: ExportColumn[],
  sales: SalesOrderWithCustomer[]
): { headers: string[]; rows: (string | number)[][] } {
  const headers = allColumns.map((c) => c.label);
  const rows = sales.flatMap((sale) => {
    const items = sale.items && sale.items.length > 0 ? sale.items : [null];
    return items.map((item) =>
      allColumns.map((column) =>
        column.valueGetter
          ? column.valueGetter(sale, item)
          : formatValue(
              column.id,
              (sale as Record<string, unknown>)[column.id],
              sale
            )
      )
    );
  });

  return { headers, rows };
}

async function writeWorkbook(
  headers: string[],
  rows: (string | number)[][],
  allColumns: ExportColumn[],
  format: SalesExportFormat
) {
  if (headers.length === 0) {
    return;
  }

  const xlsxModule = await import("xlsx");
  const XLSX = xlsxModule.default ?? xlsxModule;

  const dataForSheet = [
    headers,
    ...rows.map((row) =>
      row.map((cell, index) => {
        const columnId = allColumns[index].id;
        if (
          ["total_amount", "pending_balance", "subtotal"].includes(columnId) &&
          typeof cell === "string" &&
          cell !== "—"
        ) {
          return Number.parseFloat(cell);
        }
        return cell;
      })
    ),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(dataForSheet);
  applyCurrencyFormat(
    worksheet,
    allColumns.map((col, index) => ({ id: col.id, index })),
    rows.length
  );

  const estimatedWidths = allColumns.map((column, columnIndex) => {
    const override = columnWidthOverrides[column.id];
    if (override) {
      return override;
    }
    const maxChars = Math.max(
      column.label.length,
      ...rows.map((row) => {
        const value = row[columnIndex];
        if (typeof value === "number") {
          return value.toString().length;
        }
        if (typeof value === "string") {
          return value.length;
        }
        return 0;
      })
    );
    return Math.min(Math.max(maxChars + 4, 12), 42);
  });

  worksheet["!cols"] = estimatedWidths.map((wch) => ({ wch }));

  let blob: Blob;
  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  } else {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Ventas");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const today = new Date().toISOString().split("T")[0];
  link.href = url;
  link.download = `ventas-${today}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function SalesExportButton({ table, orgSlug }: SalesExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const columns = getVisibleExportColumns(table);
  const extraColumns = getExtraColumns();
  const allColumns = [...columns, ...extraColumns];
  reorderColumns(allColumns);

  const handleExport = async (
    format: SalesExportFormat,
    mode: "visible" | "all"
  ) => {
    setExporting(true);
    try {
      let sales: SalesOrderWithCustomer[];
      if (mode === "visible") {
        sales = table.getSortedRowModel().rows.map((r) => r.original);
      } else {
        sales = await getSalesExportAction(orgSlug);
      }

      const { headers, rows } = buildFromSales(allColumns, sales);
      await writeWorkbook(headers, rows, allColumns, format);
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
