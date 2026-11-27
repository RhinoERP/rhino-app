"use client";

import { DownloadSimpleIcon } from "@phosphor-icons/react";
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
import { exportChessPurchasesAction } from "@/modules/purchases/historical/actions/export-chess-purchases.action";
import {
  collectPurchaseHistoryExport,
  type PurchaseHistoryDocument,
  type PurchaseHistoryFilters,
  purchaseHistoryExportRows,
} from "@/modules/purchases/historical/chess-history";

type Scope = "page" | "filtered" | "all";
const SCOPES: { value: Scope; label: string }[] = [
  { value: "page", label: "página actual" },
  { value: "filtered", label: "todo lo filtrado" },
  { value: "all", label: "todo el histórico" },
];

async function download(
  documents: PurchaseHistoryDocument[],
  format: "csv" | "xlsx",
  scope: Scope
) {
  const module = await import("xlsx");
  const XLSX = module.default ?? module;
  const headers = [
    "Fecha",
    "Comprobante",
    "Tipo",
    "Código proveedor",
    "Proveedor",
    "Clasificación",
    "Moneda",
    "Total original",
    "Movimiento de deuda",
    "Compras netas",
    "Órdenes de pago (referencias)",
    "Estado de cuenta",
  ];
  const rows = purchaseHistoryExportRows(documents);
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!cols"] = headers.map((header, index) => ({
    wch: Math.min(
      55,
      rows.reduce(
        (max, row) => Math.max(max, String(row[index] ?? "").length),
        header.length
      ) + 2
    ),
  }));
  let blob: Blob;
  if (format === "csv") {
    blob = new Blob(["\uFEFF", XLSX.utils.sheet_to_csv(sheet)], {
      type: "text/csv;charset=utf-8;",
    });
  } else {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Compras históricas");
    blob = new Blob(
      [XLSX.write(workbook, { type: "array", bookType: "xlsx" })],
      {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }
    );
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `compras-historicas-${scope}-${new Date().toISOString().slice(0, 10)}.${format}`;
  link.click();
  URL.revokeObjectURL(url);
}

export function HistoricalPurchaseExportButton({
  orgSlug,
  data,
  filters,
  disabled,
}: {
  orgSlug: string;
  data: PurchaseHistoryDocument[];
  filters: PurchaseHistoryFilters;
  disabled: boolean;
}) {
  const [busy, setBusy] = useState(false);
  async function handleExport(format: "csv" | "xlsx", scope: Scope) {
    setBusy(true);
    try {
      const documents =
        scope === "page"
          ? data
          : await collectPurchaseHistoryExport((offset) =>
              exportChessPurchasesAction(orgSlug, scope, filters, offset)
            );
      await download(documents, format, scope);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo exportar"
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={disabled || busy} size="sm" variant="outline">
          <DownloadSimpleIcon />
          {busy ? "Exportando..." : "Exportar"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SCOPES.map((scope, index) => (
          <div key={scope.value}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem onSelect={() => handleExport("csv", scope.value)}>
              CSV ({scope.label})
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => handleExport("xlsx", scope.value)}
            >
              Excel ({scope.label})
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
