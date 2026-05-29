"use client";

import { ArrowDown, FileCsv, FileXls } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { formatDateOnly } from "@/lib/format";
import {
  getPaymentsReportAction,
  type PaymentReportEntry,
} from "@/modules/collections/actions/get-payments-report.action";

type CustomerOption = {
  value: string;
  label: string;
};

type DownloadPaymentsReportButtonProps = {
  orgSlug: string;
  customerOptions: CustomerOption[];
};

const FIXED_KEYS = [
  "customerName",
  "saleNumber",
  "paymentDate",
  "invoiceNumber",
  "amount",
  "sellerName",
  "supplierName",
] as const;

const FIXED_HEADERS = [
  "Cliente",
  "N° Venta",
  "Fecha",
  "N° Comprobante",
  "Importe",
  "Vendedor",
  "Proveedor",
];

const MONTO_IDX = 4;

function formatComprobante(entry: PaymentReportEntry): string {
  if (entry.invoiceNumber) {
    return `Factura N° ${entry.invoiceNumber}`;
  }
  if (entry.remittanceNumber) {
    return `Remito N° ${entry.remittanceNumber}`;
  }
  return entry.saleNumber != null ? `N° ${entry.saleNumber}` : "—";
}

function getCellValue(entry: PaymentReportEntry, key: string): string | number {
  switch (key) {
    case "paymentDate":
      return formatDateOnly(entry.paymentDate);
    case "amount":
      return entry.amount;
    case "sellerName":
      return entry.sellerName ?? "—";
    case "customerName":
      return entry.customerName;
    case "saleNumber":
      return entry.saleNumber ?? "—";
    case "invoiceNumber":
      return formatComprobante(entry);
    case "supplierName":
      return entry.supplierName ?? "—";
    default:
      return "—";
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildRows(entries: PaymentReportEntry[]): (string | number)[][] {
  return entries.map((entry) => FIXED_KEYS.map((k) => getCellValue(entry, k)));
}

async function downloadFile(
  entries: PaymentReportEntry[],
  format: "csv" | "xlsx"
) {
  const rows = buildRows(entries);
  const arrayData = [FIXED_HEADERS, ...rows];
  const xlsxModule = await import("xlsx");
  const XLSX = xlsxModule.default ?? xlsxModule;
  const ws = XLSX.utils.aoa_to_sheet(arrayData);

  const wscols = FIXED_HEADERS.map((header, colIdx) => {
    const maxLen = Math.max(
      header.length,
      ...rows.map((row) => String(row[colIdx] ?? "").length)
    );
    return { wch: Math.min(maxLen + 4, 56) };
  });
  ws["!cols"] = wscols;

  for (let r = 1; r <= rows.length; r++) {
    const addr = String.fromCharCode(65 + MONTO_IDX) + (r + 1);
    const cell = ws[addr];
    if (cell && typeof (cell as Record<string, unknown>).v === "number") {
      (cell as Record<string, unknown>).z = "#,##0.00";
    }
  }

  const dateStr = new Date().toISOString().split("T")[0];
  const filename = `reporte-pagos-${dateStr}`;

  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    downloadBlob(blob, `${filename}.csv`);
  } else {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, ws, "Pagos");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    downloadBlob(blob, `${filename}.xlsx`);
  }
}

export function DownloadPaymentsReportButton({
  orgSlug,
  customerOptions,
}: DownloadPaymentsReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [loading, setLoading] = useState(false);

  const handleExport = async (format: "csv" | "xlsx") => {
    setLoading(true);

    try {
      const { data, error } = await getPaymentsReportAction({
        orgSlug,
        customerId: customerId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });

      if (error || !data) {
        toast.error(error ?? "Error al obtener los pagos");
        return;
      }

      if (data.length === 0) {
        toast.info("No se encontraron pagos con los filtros seleccionados");
        return;
      }

      await downloadFile(data, format);

      toast.success(`Reporte exportado: ${data.length} pagos`);
      setOpen(false);
    } catch {
      toast.error("Error al generar el reporte");
    } finally {
      setLoading(false);
    }
  };

  const allCustomerOptions: CustomerOption[] = [
    { value: "", label: "Todos los clientes" },
    ...customerOptions,
  ];

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <ArrowDown className="mr-2 size-4" />
          Descargar Pagos
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">
              Descargar reporte de pagos
            </h4>
            <p className="text-muted-foreground text-sm">
              Exporta todos los pagos registrados con los filtros seleccionados.
            </p>
          </div>

          <Separator />

          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="rp-date-from">
                  Desde
                </Label>
                <Input
                  className="h-8 text-xs"
                  id="rp-date-from"
                  onChange={(e) => setDateFrom(e.target.value)}
                  type="date"
                  value={dateFrom}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="rp-date-to">
                  Hasta
                </Label>
                <Input
                  className="h-8 text-xs"
                  id="rp-date-to"
                  onChange={(e) => setDateTo(e.target.value)}
                  type="date"
                  value={dateTo}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Cliente</Label>
              <Combobox
                className="w-full"
                emptyText="Sin resultados"
                onChange={setCustomerId}
                options={allCustomerOptions}
                placeholder="Todos los clientes"
                searchPlaceholder="Buscar cliente..."
                value={customerId}
              />
            </div>
          </div>

          <Separator />

          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={loading}
              onClick={() => handleExport("csv")}
              size="sm"
              variant="secondary"
            >
              <FileCsv className="mr-2 size-4" />
              CSV
            </Button>
            <Button
              className="flex-1"
              disabled={loading}
              onClick={() => handleExport("xlsx")}
              size="sm"
              variant="secondary"
            >
              <FileXls className="mr-2 size-4" />
              Excel
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
