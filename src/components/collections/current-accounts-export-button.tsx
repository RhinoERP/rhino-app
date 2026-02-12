"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import type { CellObject, WorkSheet } from "xlsx";
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
type GroupItem = Group["items"][number];

type CurrentAccountsExportButtonProps = {
  groups: Group[];
  orgSlug: string;
  type: "receivable" | "payable";
};

type ExportFormat = "csv" | "xlsx";

const statusLabels: Record<string, string> = {
  PENDING: "Pendiente",
  PARTIAL: "Parcial",
  PAID: "Pagado",
};

const columnWidthOverrides = [22, 16, 16, 14, 16, 16] as const;

type ReceivablePaymentRow = {
  account_receivable_id: string | null;
  amount: number;
  payment_method: string;
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string | null;
  source: "payment" | "credit";
};

type CellValue = string | number;

type SaleBlock = {
  startRow: number;
  endRow: number;
};

type BorderStyle = {
  style: "thin";
  color: { rgb: string };
};

type ApplyBorderParams = {
  worksheet: WorkSheet;
  XLSX: typeof import("xlsx");
  row: number;
  col: number;
  block: SaleBlock;
  columnCount: number;
  borderStyle: BorderStyle;
};

type BuildRowsOptions = {
  groups: Group[];
  type: "receivable" | "payable";
  creditBalancesByCustomer: Map<string, number>;
  paymentsByAccount: Map<string, ReceivablePaymentRow[]>;
};

const formatNumberCell = (value: number | null | undefined): number | "" => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "";
  }
  return Math.round(value * 100) / 100;
};

const formatPaymentMethodLabel = (method: string | null) => {
  if (!method) {
    return "—";
  }
  const normalized = method.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "—";
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const buildGroupSummaryRows = (
  group: Group,
  type: BuildRowsOptions["type"],
  creditBalancesByCustomer: Map<string, number>
): CellValue[][] => {
  const rows: CellValue[][] = [];
  const pendingSum = group.items.reduce(
    (sum, item) => sum + (item.pending ?? 0),
    0
  );

  rows.push([
    group.name,
    "",
    "",
    "Pendiente",
    "",
    formatNumberCell(pendingSum),
  ]);

  if (type === "receivable") {
    const creditBalance = creditBalancesByCustomer.get(group.id) ?? 0;
    if (creditBalance > 0) {
      rows.push([
        "",
        "",
        "",
        "Saldo a favor",
        "",
        formatNumberCell(creditBalance),
      ]);
    }
  }

  if ("fantasyName" in group && group.fantasyName) {
    rows.push([group.fantasyName, "", "", "", "", ""]);
  }

  return rows;
};

const buildColumnHeaderRow = (): CellValue[] => [
  "Documento",
  "Vencimiento",
  "Último pago",
  "Estado",
  "Total",
  "Pendiente",
];

const buildBlankRow = (): CellValue[] => ["", "", "", "", "", ""];

const buildItemRow = (item: GroupItem): CellValue[] => [
  item.label,
  item.dueDate ? formatDateOnly(item.dueDate) : "—",
  item.lastPaymentDate ? formatDateOnly(item.lastPaymentDate) : "—",
  statusLabels[item.status] ?? "—",
  formatNumberCell(item.total),
  formatNumberCell(item.pending),
];

const buildPaymentRow = (payment: ReceivablePaymentRow): CellValue[] => {
  const reference = payment.reference_number
    ? ` (${payment.reference_number})`
    : "";
  const label = payment.source === "credit" ? "-> Crédito aplicado" : "-> Pago";

  return [
    `${label}${reference}`,
    "",
    payment.payment_date ? formatDateOnly(payment.payment_date) : "—",
    payment.source === "credit"
      ? "Crédito"
      : formatPaymentMethodLabel(payment.payment_method),
    formatNumberCell(payment.amount),
    "",
  ];
};

const getPaymentRowsForItem = (
  itemId: string,
  type: BuildRowsOptions["type"],
  paymentsByAccount: Map<string, ReceivablePaymentRow[]>
): CellValue[][] => {
  if (type !== "receivable") {
    return [];
  }
  const payments = paymentsByAccount.get(itemId) ?? [];
  return payments.map(buildPaymentRow);
};

function buildRows({
  groups,
  type,
  creditBalancesByCustomer,
  paymentsByAccount,
}: BuildRowsOptions): { rows: CellValue[][]; saleBlocks: SaleBlock[] } {
  const rows: CellValue[][] = [];
  const saleBlocks: SaleBlock[] = [];

  for (const group of groups) {
    rows.push(...buildGroupSummaryRows(group, type, creditBalancesByCustomer));
    rows.push(buildColumnHeaderRow());

    for (const item of group.items) {
      const saleRowStart = rows.length;
      rows.push(buildItemRow(item));
      rows.push(...getPaymentRowsForItem(item.id, type, paymentsByAccount));

      saleBlocks.push({
        startRow: saleRowStart,
        endRow: rows.length - 1,
      });
    }

    rows.push(buildBlankRow());
  }

  return { rows, saleBlocks };
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

function applyBorderToCell({
  worksheet,
  XLSX,
  row,
  col,
  block,
  columnCount,
  borderStyle,
}: ApplyBorderParams) {
  const address = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = worksheet[address] as CellObject | undefined;
  if (!cell) {
    return;
  }

  const border = { ...(cell.s?.border ?? {}) } as Record<string, unknown>;

  if (row === block.startRow) {
    border.top = borderStyle;
  }
  if (row === block.endRow) {
    border.bottom = borderStyle;
  }
  if (col === 0) {
    border.left = borderStyle;
  }
  if (col === columnCount - 1) {
    border.right = borderStyle;
  }

  cell.s = { ...(cell.s ?? {}), border };
}

function applySaleBlockBorders(
  worksheet: WorkSheet,
  saleBlocks: SaleBlock[],
  columnCount: number,
  XLSX: typeof import("xlsx")
) {
  const borderStyle: BorderStyle = {
    style: "thin",
    color: { rgb: "D0D5DD" },
  };

  for (const block of saleBlocks) {
    for (let row = block.startRow; row <= block.endRow; row += 1) {
      for (let col = 0; col < columnCount; col += 1) {
        applyBorderToCell({
          worksheet,
          XLSX,
          row,
          col,
          block,
          columnCount,
          borderStyle,
        });
      }
    }
  }
}

async function fetchCustomerCreditBalances(
  orgSlug: string,
  groups: Group[]
): Promise<Map<string, number>> {
  const balances = new Map<string, number>();

  await Promise.all(
    groups.map(async (group) => {
      try {
        const response = await fetch(
          `/api/collections/customer-credit?orgSlug=${orgSlug}&customerId=${group.id}`
        );

        if (!response.ok) {
          balances.set(group.id, 0);
          return;
        }

        const data = await response.json();
        balances.set(group.id, Number(data.creditBalance ?? 0));
      } catch {
        balances.set(group.id, 0);
      }
    })
  );

  return balances;
}

async function fetchReceivablePaymentsMap(
  orgSlug: string,
  groups: Group[]
): Promise<Map<string, ReceivablePaymentRow[]>> {
  const accountIds = Array.from(
    new Set(
      groups
        .flatMap((group) => group.items.map((item) => item.id))
        .filter((id) => Boolean(id))
    )
  );

  if (accountIds.length === 0) {
    return new Map();
  }

  try {
    const response = await fetch("/api/collections/receivable-payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgSlug, accountIds }),
    });

    if (!response.ok) {
      return new Map();
    }

    const data = await response.json();
    const payments = (data.payments ?? []) as ReceivablePaymentRow[];
    const map = new Map<string, ReceivablePaymentRow[]>();

    for (const payment of payments) {
      if (!payment.account_receivable_id) {
        continue;
      }
      const existing = map.get(payment.account_receivable_id) ?? [];
      existing.push(payment);
      map.set(payment.account_receivable_id, existing);
    }

    for (const [accountId, list] of map) {
      list.sort((a, b) => {
        const dateA = new Date(a.payment_date).getTime();
        const dateB = new Date(b.payment_date).getTime();
        return dateB - dateA;
      });
      map.set(accountId, list);
    }

    return map;
  } catch {
    return new Map();
  }
}

async function downloadCurrentAccounts(
  format: ExportFormat,
  groups: Group[],
  orgSlug: string,
  type: "receivable" | "payable"
) {
  const creditBalancesByCustomer =
    type === "receivable"
      ? await fetchCustomerCreditBalances(orgSlug, groups)
      : new Map<string, number>();

  const paymentsByAccount =
    type === "receivable"
      ? await fetchReceivablePaymentsMap(orgSlug, groups)
      : new Map<string, ReceivablePaymentRow[]>();

  const { rows, saleBlocks } = buildRows({
    groups,
    type,
    creditBalancesByCustomer,
    paymentsByAccount,
  });
  if (!rows.length) {
    return;
  }

  const xlsxModule = await import("xlsx");
  const XLSX = xlsxModule.default ?? xlsxModule;
  const worksheet = XLSX.utils.aoa_to_sheet(rows);

  const widths = estimateWidths(rows);
  worksheet["!cols"] = widths.map((wch) => ({ wch }));
  applySaleBlockBorders(
    worksheet,
    saleBlocks,
    columnWidthOverrides.length,
    XLSX
  );

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
  orgSlug,
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
          onSelect={() => downloadCurrentAccounts("csv", groups, orgSlug, type)}
        >
          <FileText className="mr-2 h-4 w-4" />
          Exportar CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!hasData}
          onSelect={() =>
            downloadCurrentAccounts("xlsx", groups, orgSlug, type)
          }
        >
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Exportar Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
