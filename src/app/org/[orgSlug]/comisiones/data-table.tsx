"use client";

import {
  CaretDownIcon,
  CaretRightIcon,
  CurrencyDollarSimpleIcon,
  MagnifyingGlassIcon,
  XIcon,
} from "@phosphor-icons/react";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo, useRef, useState } from "react";
import { CommissionsExportButton } from "@/components/commissions/commissions-export-button";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDataTable } from "@/hooks/use-data-table";
import { formatCurrency, formatDate } from "@/lib/format";
import type {
  CommissionSale,
  CommissionSeller,
} from "@/modules/commissions/types";
import { createCommissionsColumns } from "./columns";

type CommissionsDataTableProps = {
  data: CommissionSeller[];
  orgSlug: string;
  pageCount: number;
  month?: string;
};

export function CommissionsDataTable({
  data,
  orgSlug,
  pageCount,
  month,
}: CommissionsDataTableProps) {
  const everHadData = useRef(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandedPayments, setExpandedPayments] = useState<Set<string>>(
    new Set()
  );
  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withOptions({ shallow: false }).withDefault("")
  );

  const columns = useMemo(() => createCommissionsColumns(), []);

  const { table } = useDataTable<CommissionSeller>({
    data,
    columns,
    pageCount,
    getRowId: (row) => row.userId,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    shallow: false,
    initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
  });

  if (data.length > 0) {
    everHadData.current = true;
  }

  const toggleExpand = (userId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const togglePayments = (saleId: string) => {
    setExpandedPayments((prev) => {
      const next = new Set(prev);
      if (next.has(saleId)) {
        next.delete(saleId);
      } else {
        next.add(saleId);
      }
      return next;
    });
  };

  const statusBadge = (status: CommissionSale["status"]) => {
    const styles: Record<CommissionSale["status"], string> = {
      PENDING: "bg-amber-100 text-amber-700",
      PARTIAL: "bg-blue-100 text-blue-700",
      PAID: "bg-green-100 text-green-700",
      VOID: "bg-muted text-muted-foreground",
    };
    const labels: Record<CommissionSale["status"], string> = {
      PENDING: "Pendiente",
      PARTIAL: "Parcial",
      PAID: "Pagada",
      VOID: "Anulada",
    };
    return (
      <span
        className={`inline-block rounded-full px-2 py-0.5 font-medium text-[10px] ${styles[status]}`}
      >
        {labels[status]}
      </span>
    );
  };

  if (data.length === 0 && !everHadData.current && !search) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CurrencyDollarSimpleIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>No hay comisiones</EmptyTitle>
            <EmptyDescription>
              No hay cobros registrados este mes con comisiones.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const rows = table.getRowModel().rows;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <MagnifyingGlassIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="h-8 w-48 pl-8 lg:w-72"
              onChange={(e) => {
                setSearch(e.target.value || null);
                table.setPageIndex(0);
              }}
              placeholder="Buscar vendedor..."
              value={search}
            />
          </div>
          {search && (
            <Button
              className="border-dashed"
              onClick={() => {
                setSearch(null);
                table.setPageIndex(0);
              }}
              size="sm"
              variant="outline"
            >
              <XIcon />
              Limpiar
            </Button>
          )}
        </div>
        <CommissionsExportButton month={month} orgSlug={orgSlug} />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Vendedor</TableHead>
              <TableHead>Com. base</TableHead>
              <TableHead className="text-right">Ventas</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">Comisión</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const seller = row.original;
              const isExpanded = expandedRows.has(seller.userId);
              return (
                <>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50"
                    key={seller.userId}
                    onClick={() => toggleExpand(seller.userId)}
                  >
                    <TableCell>
                      {isExpanded ? (
                        <CaretDownIcon className="h-4 w-4" />
                      ) : (
                        <CaretRightIcon className="h-4 w-4" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {seller.sellerName}
                    </TableCell>
                    <TableCell>{seller.baseCommissionRate}%</TableCell>
                    <TableCell className="text-right">
                      {seller.saleCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(seller.totalSubtotal)}
                    </TableCell>
                    <TableCell className="text-right font-medium text-green-600">
                      {formatCurrency(seller.totalCommission)}
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow className="bg-muted/30">
                      <TableCell />
                      <TableCell colSpan={5}>
                        <div className="space-y-2 py-1">
                          {seller.sales.length === 0 && (
                            <p className="text-muted-foreground text-xs">
                              Sin ventas con comisión en este período.
                            </p>
                          )}
                          {seller.sales.map((sale) => {
                            const isPaymentsOpen = expandedPayments.has(
                              sale.id
                            );
                            return (
                              <div
                                className="rounded-md border bg-background p-3"
                                key={sale.id}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <button
                                        aria-label="Ver pagos"
                                        className="flex items-center"
                                        onClick={() => togglePayments(sale.id)}
                                        type="button"
                                      >
                                        {isPaymentsOpen ? (
                                          <CaretDownIcon className="h-4 w-4" />
                                        ) : (
                                          <CaretRightIcon className="h-4 w-4" />
                                        )}
                                      </button>
                                      <span className="font-medium text-xs">
                                        #{sale.saleNumber || "—"}
                                      </span>
                                      {statusBadge(sale.status)}
                                    </div>
                                    <div className="pl-6 text-muted-foreground text-xs">
                                      {sale.customerName}
                                      {sale.invoiceNumber
                                        ? ` · ${sale.invoiceNumber}`
                                        : ""}
                                    </div>
                                    <div className="pl-6 text-muted-foreground text-xs">
                                      {sale.dispatchedAt
                                        ? `Despachada ${formatDate(sale.dispatchedAt)}`
                                        : "Sin despacho"}
                                    </div>
                                  </div>
                                  <div className="text-right text-xs">
                                    <div>
                                      Subtotal {formatCurrency(sale.subTotal)}
                                    </div>
                                    <div>Tasa {sale.commissionRate}%</div>
                                    <div className="font-medium">
                                      Comisión total{" "}
                                      {formatCurrency(sale.totalCommission)}
                                    </div>
                                    <div className="text-green-600">
                                      Cobrada{" "}
                                      {formatCurrency(sale.paidCommission)}
                                    </div>
                                    <div className="text-muted-foreground">
                                      Pendiente{" "}
                                      {formatCurrency(sale.remainingCommission)}
                                    </div>
                                  </div>
                                </div>
                                {isPaymentsOpen &&
                                  sale.payments.map((payment) => (
                                    <div
                                      className="mt-2 flex items-center justify-between border-t px-6 py-1.5 text-xs"
                                      key={payment.id}
                                    >
                                      <div className="flex items-center gap-4">
                                        <span className="font-medium">
                                          {payment.paidAt
                                            ? formatDate(payment.paidAt)
                                            : "—"}
                                        </span>
                                        <span>
                                          {formatCurrency(payment.paidAmount)}
                                        </span>
                                      </div>
                                      <span className="text-green-600">
                                        {formatCurrency(
                                          payment.commissionAmount
                                        )}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            );
                          })}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
