"use client";

import {
  BankIcon,
  CaretLeftIcon,
  CaretRightIcon,
  PiggyBankIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import type { CollectionAlertItem, PayableAlertItem } from "@/types/dashboard";

type CollectionsAlertsTableProps = {
  receivables: CollectionAlertItem[];
  payables: PayableAlertItem[];
};

type AlertBucket = "bajo" | "medio" | "critico";

type BucketedData<T> = {
  bajo: T[];
  medio: T[];
  critico: T[];
};

function getDaysBadge(daysUntilDue: number) {
  if (daysUntilDue <= -8) {
    return {
      label: `+${Math.abs(daysUntilDue)}d`,
      className: "bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-200",
    };
  }
  if (daysUntilDue < 0) {
    return {
      label: `${Math.abs(daysUntilDue)}d`,
      className:
        "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    };
  }
  if (daysUntilDue === 0) {
    return {
      label: "Hoy",
      className:
        "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    };
  }
  return {
    label: `${daysUntilDue}d`,
    className:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  };
}

function bucketByCriticity<T extends { daysUntilDue: number }>(
  items: T[]
): BucketedData<T> {
  const bajo: T[] = [];
  const medio: T[] = [];
  const critico: T[] = [];

  for (const item of items) {
    if (item.daysUntilDue <= -8) {
      critico.push(item);
    } else if (item.daysUntilDue < 0) {
      medio.push(item);
    } else {
      bajo.push(item);
    }
  }

  return { bajo, medio, critico };
}

const ALERT_BUCKETS: { value: AlertBucket; label: string }[] = [
  { value: "critico", label: "Crítico" },
  { value: "medio", label: "Medio" },
  { value: "bajo", label: "Bajo" },
];

const PAGE_SIZE = 10;

function PaginationControls({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-t px-4 py-2">
      <span className="text-muted-foreground text-xs">
        Página {page + 1} de {totalPages}
      </span>
      <div className="flex items-center gap-1">
        <Button
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
          size="icon"
          variant="ghost"
        >
          <CaretLeftIcon className="h-4 w-4" weight="bold" />
        </Button>
        <Button
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
          size="icon"
          variant="ghost"
        >
          <CaretRightIcon className="h-4 w-4" weight="bold" />
        </Button>
      </div>
    </div>
  );
}

function PaginatedAlertTable<T>({
  data,
  columns,
  renderRow,
}: {
  data: T[];
  columns: { label: string; className?: string }[];
  renderRow: (item: T) => ReactNode;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  const pageData = data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="rounded-md border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            {columns.map((col) => (
              <th
                className={`px-4 py-3 font-medium text-sm ${col.className ?? "text-left"}`}
                key={col.label}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{pageData.map((item) => renderRow(item))}</tbody>
      </table>
      {totalPages > 1 && (
        <PaginationControls
          onPageChange={setPage}
          page={page}
          totalPages={totalPages}
        />
      )}
    </div>
  );
}

const RECEIVABLE_COLUMNS = [
  { label: "Cliente" },
  { label: "Factura" },
  { label: "Pendiente", className: "text-right" },
  { label: "Vencimiento", className: "text-right" },
  { label: "Estado", className: "text-center" },
];

const PAYABLE_COLUMNS = [
  { label: "Proveedor" },
  { label: "Compra N°" },
  { label: "Pendiente", className: "text-right" },
  { label: "Vencimiento", className: "text-right" },
  { label: "Estado", className: "text-center" },
];

function ReceivablesTable({ data }: { data: CollectionAlertItem[] }) {
  const buckets = useMemo(() => bucketByCriticity(data), [data]);

  return (
    <Tabs className="w-full" defaultValue="critico">
      <TabsList className="grid w-full grid-cols-3">
        {ALERT_BUCKETS.map((bucket) => (
          <TabsTrigger key={bucket.value} value={bucket.value}>
            {bucket.label} ({buckets[bucket.value].length})
          </TabsTrigger>
        ))}
      </TabsList>
      {ALERT_BUCKETS.map((bucket) => (
        <TabsContent className="mt-4" key={bucket.value} value={bucket.value}>
          {buckets[bucket.value].length > 0 ? (
            <PaginatedAlertTable
              columns={RECEIVABLE_COLUMNS}
              data={buckets[bucket.value]}
              renderRow={(item) => {
                const badge = getDaysBadge(item.daysUntilDue);
                return (
                  <tr className="border-b last:border-0" key={item.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-sm">{item.customerName}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">
                      {item.invoiceNumber ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-sm">
                      {formatCurrency(item.pendingBalance)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      {formatDateOnly(item.dueDate)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-medium text-xs ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              }}
            />
          ) : (
            <p className="py-8 text-center text-muted-foreground text-sm">
              Sin alertas en este nivel
            </p>
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}

function PayablesTable({ data }: { data: PayableAlertItem[] }) {
  const buckets = useMemo(() => bucketByCriticity(data), [data]);

  return (
    <Tabs className="w-full" defaultValue="critico">
      <TabsList className="grid w-full grid-cols-3">
        {ALERT_BUCKETS.map((bucket) => (
          <TabsTrigger key={bucket.value} value={bucket.value}>
            {bucket.label} ({buckets[bucket.value].length})
          </TabsTrigger>
        ))}
      </TabsList>
      {ALERT_BUCKETS.map((bucket) => (
        <TabsContent className="mt-4" key={bucket.value} value={bucket.value}>
          {buckets[bucket.value].length > 0 ? (
            <PaginatedAlertTable
              columns={PAYABLE_COLUMNS}
              data={buckets[bucket.value]}
              renderRow={(item) => {
                const badge = getDaysBadge(item.daysUntilDue);
                return (
                  <tr className="border-b last:border-0" key={item.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-sm">{item.supplierName}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">
                      {item.purchaseNumber ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-sm">
                      {formatCurrency(item.pendingBalance)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      {formatDateOnly(item.dueDate)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-medium text-xs ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              }}
            />
          ) : (
            <p className="py-8 text-center text-muted-foreground text-sm">
              Sin alertas en este nivel
            </p>
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}

export function CollectionsAlertsTable({
  receivables,
  payables,
}: CollectionsAlertsTableProps) {
  return (
    <Tabs className="w-full" defaultValue="receivables">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="receivables">
          <PiggyBankIcon className="mr-1.5 h-4 w-4" weight="duotone" />
          Por Cobrar ({receivables.length})
        </TabsTrigger>
        <TabsTrigger value="payables">
          <BankIcon className="mr-1.5 h-4 w-4" weight="duotone" />
          Por Pagar ({payables.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent className="mt-4" value="receivables">
        {receivables.length > 0 ? (
          <ReceivablesTable data={receivables} />
        ) : (
          <p className="py-8 text-center text-muted-foreground text-sm">
            No hay cuentas por cobrar próximas a vencer
          </p>
        )}
      </TabsContent>

      <TabsContent className="mt-4" value="payables">
        {payables.length > 0 ? (
          <PayablesTable data={payables} />
        ) : (
          <p className="py-8 text-center text-muted-foreground text-sm">
            No hay cuentas por pagar próximas a vencer
          </p>
        )}
      </TabsContent>
    </Tabs>
  );
}
