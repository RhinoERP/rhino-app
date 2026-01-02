"use client";

import type { Table } from "@tanstack/react-table";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";
import type { InvoiceType, SalesOrderStatus } from "@/modules/sales/types";
import {
  getCustomerDisplayName,
  invoiceTypeLabels,
  statusLabels,
} from "./sale-columns-all";

type SalesExportButtonProps = {
  table: Table<SalesOrderWithCustomer>;
};

type SalesExportFormat = "csv" | "xlsx";
type PaymentStatus = Exclude<
  NonNullable<SalesOrderWithCustomer["receivable"]>["status"],
  null
>;

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
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  PENDING: "Pendiente",
  PARTIALLY_PAID: "Pago parcial",
  PAID: "Pagado",
  OVERDUE: "Vencido",
};

type ExportColumn = {
  id: string;
  label: string;
  valueGetter?: (sale: SalesOrderWithCustomer) => string;
};

function formatFallbackValue(rawValue: unknown): string {
  return rawValue ? String(rawValue) : "—";
}

function formatSaleNumberValue(
  rawValue: unknown,
  sale: SalesOrderWithCustomer
): string {
  if (typeof rawValue === "number") {
    return rawValue ? String(rawValue) : "—";
  }

  if (typeof rawValue === "string" && rawValue !== "") {
    return rawValue;
  }

  const fallback = sale.invoice_number ?? sale.sale_number;
  return fallback ? String(fallback) : "—";
}

function formatSellerValue(
  rawValue: unknown,
  sale: SalesOrderWithCustomer
): string {
  if (typeof rawValue === "string" && rawValue.trim().length > 0) {
    return rawValue;
  }

  const fallback = sale.seller?.name || sale.seller?.email;
  return fallback || "—";
}

function formatInvoiceTypeValue(
  rawValue: unknown,
  sale: SalesOrderWithCustomer
): string {
  const invoiceType =
    typeof rawValue === "string" ? rawValue : sale.invoice_type;
  if (!invoiceType) {
    return "—";
  }
  return invoiceTypeLabels[invoiceType as InvoiceType] ?? "—";
}

function formatStatusValue(
  rawValue: unknown,
  sale: SalesOrderWithCustomer
): string {
  const status = typeof rawValue === "string" ? rawValue : sale.status;
  if (!status) {
    return "—";
  }
  return statusLabels[status as SalesOrderStatus]?.label ?? "—";
}

type SaleColumnFormatter = (
  rawValue: unknown,
  sale: SalesOrderWithCustomer
) => string;

const saleValueFormatters: Record<string, SaleColumnFormatter> = {
  sale_number: formatSaleNumberValue,
  customer: (_rawValue, sale) => getCustomerDisplayName(sale),
  seller: formatSellerValue,
  sale_date: (_rawValue, sale) =>
    sale.sale_date ? formatDateOnly(sale.sale_date) : "—",
  expiration_date: (_rawValue, sale) =>
    sale.expiration_date ? formatDateOnly(sale.expiration_date) : "—",
  invoice_type: formatInvoiceTypeValue,
  status: formatStatusValue,
  total_amount: (rawValue, sale) => {
    const amount = typeof rawValue === "number" ? rawValue : sale.total_amount;
    return formatCurrency(amount);
  },
};

function formatSaleValue(
  columnId: string,
  rawValue: unknown,
  sale: SalesOrderWithCustomer
): string {
  const formatter = saleValueFormatters[columnId];
  if (formatter) {
    return formatter(rawValue, sale);
  }
  return formatFallbackValue(rawValue);
}

function getPaymentStatus(sale: SalesOrderWithCustomer): PaymentStatus | null {
  const status = sale.receivable?.status;
  if (status === null || status === undefined) {
    return null;
  }
  return status;
}

function buildExportContent(table: Table<SalesOrderWithCustomer>) {
  const visibleColumns = table
    .getVisibleLeafColumns()
    .filter((column) => column.id !== "actions");

  const columns: ExportColumn[] = visibleColumns.map((column) => ({
    id: column.id,
    label: column.columnDef.meta?.label ?? column.id,
  }));

  const exportOnlyColumns: ExportColumn[] = [
    {
      id: "payment_status",
      label: "Pago",
      valueGetter: (sale) => {
        const status = getPaymentStatus(sale);
        return status ? paymentStatusLabels[status] : "—";
      },
    },
  ];

  const allColumns = [...columns, ...exportOnlyColumns];

  const rows = table
    .getSortedRowModel()
    .rows.map((row) =>
      allColumns.map((column) =>
        column.valueGetter
          ? column.valueGetter(row.original)
          : formatSaleValue(column.id, row.getValue(column.id), row.original)
      )
    );

  const headers = allColumns.map((column) => column.label);

  return { headers, rows, columns: allColumns };
}

async function downloadSales(
  format: SalesExportFormat,
  table: Table<SalesOrderWithCustomer>
) {
  const { headers, rows, columns } = buildExportContent(table);
  if (headers.length === 0) {
    return;
  }

  const xlsxModule = await import("xlsx");
  const XLSX = xlsxModule.default ?? xlsxModule;
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  const estimatedWidths = columns.map((column, columnIndex) => {
    const override = columnWidthOverrides[column.id];
    if (override) {
      return override;
    }

    const maxChars = Math.max(
      column.label.length,
      ...rows.map((row) => row[columnIndex]?.length ?? 0)
    );

    const baseWidth = Math.min(Math.max(maxChars + 2, 10), 40);
    return baseWidth;
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

export function SalesExportButton({ table }: SalesExportButtonProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => downloadSales("csv", table)}>
          <FileText className="mr-2 h-4 w-4" />
          Exportar CSV
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => downloadSales("xlsx", table)}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Exportar Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
