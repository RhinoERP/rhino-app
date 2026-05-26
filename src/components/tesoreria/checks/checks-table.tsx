"use client";

import {
  type ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { updateCheckStatusAction } from "@/modules/tesoreria/actions/manage-checks.action";
import {
  CHECK_STATUS_LABELS,
  type CheckStatus,
  type IssuedCheck,
} from "@/modules/tesoreria/types";
import { CheckStatusBadge } from "./check-status-badge";

type Filter = CheckStatus | "all";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Sin debitar" },
  { value: "debited", label: "Debitados" },
  { value: "exchanged", label: "Canjeados" },
  { value: "overdue", label: "Vencidos ⚠️" },
];

type Props = {
  checks: IssuedCheck[];
  orgSlug: string;
  todayStr: string;
};

export function ChecksTable({ checks, orgSlug, todayStr }: Props) {
  const [activeFilter, setActiveFilter] = useState<Filter>("all");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleStatusUpdate(id: string, status: CheckStatus) {
    startTransition(async () => {
      const result = await updateCheckStatusAction(orgSlug, { id, status });
      if (result.success) {
        toast.success(`Cheque marcado como ${CHECK_STATUS_LABELS[status]}`);
        router.refresh();
      } else {
        toast.error(result.error ?? "Error al actualizar el cheque");
      }
    });
  }

  const columns: ColumnDef<IssuedCheck>[] = [
    {
      accessorKey: "check_number",
      header: "N° Cheque",
      cell: ({ row }) => (
        <span className="font-mono text-sm font-semibold">
          {row.getValue("check_number")}
        </span>
      ),
    },
    {
      accessorKey: "payee",
      header: "Proveedor / Beneficiario",
      cell: ({ row }) => (
        <span className="font-medium">{row.getValue("payee")}</span>
      ),
    },
    {
      accessorKey: "bank_account",
      header: "Cuenta bancaria",
      cell: ({ row }) => {
        const acc = row.getValue<{ name: string } | null>("bank_account");
        return (
          <span className="text-muted-foreground text-sm">
            {acc?.name ?? "—"}
          </span>
        );
      },
    },
    {
      accessorKey: "issue_date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Emisión" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {formatDateOnly(row.getValue("issue_date"))}
        </span>
      ),
    },
    {
      accessorKey: "payment_date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Fecha de pago" />
      ),
      cell: ({ row }) => {
        const date = row.getValue<string>("payment_date");
        const isToday = date === todayStr;
        const isOverdue = date < todayStr && row.original.status === "pending";
        return (
          <span
            className={`font-medium ${
              isToday
                ? "text-amber-600"
                : isOverdue
                  ? "text-red-600"
                  : "text-foreground"
            }`}
          >
            {formatDateOnly(date)}
            {isToday && " 🔔"}
            {isOverdue && " ⚠️"}
          </span>
        );
      },
    },
    {
      accessorKey: "amount",
      header: ({ column }) => (
        <DataTableColumnHeader
          className="justify-end"
          column={column}
          label="Monto"
        />
      ),
      cell: ({ row }) => (
        <span className="font-mono font-semibold">
          {formatCurrency(row.getValue("amount"))}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => <CheckStatusBadge status={row.getValue("status")} />,
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const status = row.original.status;
        if (status === "debited" || status === "exchanged") return null;
        if (status === "overdue") {
          return (
            <Button
              disabled={pending}
              onClick={() => handleStatusUpdate(row.original.id, "debited")}
              size="sm"
              variant="destructive"
            >
              Gestionar
            </Button>
          );
        }
        return (
          <Button
            disabled={pending}
            onClick={() => handleStatusUpdate(row.original.id, "debited")}
            size="sm"
            variant="outline"
          >
            Marcar debitado
          </Button>
        );
      },
    },
  ];

  const filtered =
    activeFilter === "all"
      ? checks
      : checks.filter((c) => c.status === activeFilter);

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.id,
    initialState: { pagination: { pageSize: 25 } },
  });

  return (
    <DataTable table={table}>
      <div className="p-1">
        <Tabs
          onValueChange={(v) => setActiveFilter(v as Filter)}
          value={activeFilter}
        >
          <TabsList>
            {FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value}>
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
    </DataTable>
  );
}
