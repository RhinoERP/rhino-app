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
import {
  applyCurrencyFormat,
  exportInvoiceTypeLabels,
  exportStatusLabels,
  formatExportCurrency,
  formatExportDate,
} from "@/lib/export-utils";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";
import type { InvoiceType, SalesOrderStatus } from "@/modules/sales/types";
import { getCustomerDisplayName } from "./columns/sale-columns-all";

type SalesExportButtonProps = {
  table: Table<SalesOrderWithCustomer>;
};

type SalesExportFormat = "csv" | "xlsx";
type PaymentStatus = Exclude<
  NonNullable<SalesOrderWithCustomer["receivable"]>["status"],
  null
>;
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
  PENDING: "Pendiente",
  PARTIALLY_PAID: "Parcial",
  PAID: "Pagada",
  OVERDUE: "Vencido",
};

type ExportColumn = {
  id: string;
  label: string;
  valueGetter?: (
    sale: SalesOrderWithCustomer,
    item?: SaleItem | null
  ) => string | number;
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
  return exportInvoiceTypeLabels[invoiceType as InvoiceType] ?? "—";
}

function formatStatusValue(
  rawValue: unknown,
  sale: SalesOrderWithCustomer
): string {
  const status = typeof rawValue === "string" ? rawValue : sale.status;
  if (!status) {
    return "—";
  }
  return exportStatusLabels[status as SalesOrderStatus] ?? "—";
}

type SaleColumnFormatter = (
  rawValue: unknown,
  sale: SalesOrderWithCustomer
) => string;

const saleValueFormatters: Record<string, SaleColumnFormatter> = {
  sale_number: formatSaleNumberValue,
  customer: (_rawValue, sale) => getCustomerDisplayName(sale),
  seller: formatSellerValue,
  sale_date: (_rawValue, sale) => formatExportDate(sale.sale_date),
  expiration_date: (_rawValue, sale) => formatExportDate(sale.expiration_date),
  invoice_type: formatInvoiceTypeValue,
  status: formatStatusValue,
  total_amount: (rawValue, sale) => {
    const amount = typeof rawValue === "number" ? rawValue : sale.total_amount;
    return formatExportCurrency(amount);
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

function calculateExportSubtotal(sale: SalesOrderWithCustomer): number {
  const base = Number(sale.sub_total ?? 0);
  const discount = Number(sale.global_discount_amount ?? 0);
  const safeBase = Number.isFinite(base) ? base : 0;
  const safeDiscount = Number.isFinite(discount) ? discount : 0;

  return Number((safeBase - safeDiscount).toFixed(2));
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
      label: "Estado Pago",
      valueGetter: (sale) => {
        const status = getPaymentStatus(sale);
        return status ? paymentStatusLabels[status] : "Pendiente";
      },
    },
  ];

  const itemColumns: ExportColumn[] = [
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
      valueGetter: (sale) => calculateExportSubtotal(sale),
    },
  ];

  const allColumns = [...columns, ...exportOnlyColumns, ...itemColumns];
  const subtotalIndex = allColumns.findIndex(
    (column) => column.id === "subtotal"
  );
  const totalIndex = allColumns.findIndex(
    (column) => column.id === "total_amount"
  );

  if (subtotalIndex > -1 && totalIndex > -1 && subtotalIndex > totalIndex) {
    const [subtotalColumn] = allColumns.splice(subtotalIndex, 1);
    allColumns.splice(totalIndex, 0, subtotalColumn);
  }

  const rows = table.getSortedRowModel().rows.flatMap((row) => {
    const sale = row.original;
    const items = sale.items && sale.items.length > 0 ? sale.items : [null];
    return items.map((item) =>
      allColumns.map((column) =>
        column.valueGetter
          ? column.valueGetter(sale, item)
          : formatSaleValue(column.id, row.getValue(column.id), sale)
      )
    );
  });

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

  // Convert data to worksheet, treating currency columns as numbers
  const dataForSheet = [
    headers,
    ...rows.map((row) =>
      row.map((cell, index) => {
        const columnId = columns[index].id;
        // Convert currency strings back to numbers for Excel
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

  // Apply currency formatting to monetary columns
  applyCurrencyFormat(
    worksheet,
    columns.map((col, index) => ({ id: col.id, index })),
    rows.length
  );

  const estimatedWidths = columns.map((column, columnIndex) => {
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
