"use client";

import { HandCoinsIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useDataTable } from "@/hooks/use-data-table";
import type { ReceivableAccount } from "@/modules/collections/types";
import { BulkPaymentDialog } from "./bulk-payment-dialog";
import { createReceivableColumns } from "./collection-columns";
import { CollectionsExportButton } from "./collections-export-button";
import { DownloadPaymentsReportButton } from "./download-payments-report-button";

type ReceivablesTableProps = {
  initialData: ReceivableAccount[];
  orgSlug: string;
  pageCount: number;
};

export function ReceivablesTable({
  initialData,
  orgSlug,
  pageCount,
}: ReceivablesTableProps) {
  const [bulkPaymentOpen, setBulkPaymentOpen] = useState(false);

  const customerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of initialData) {
      if (account.customer.id) {
        const fantasy = account.customer.fantasy_name?.trim();
        const business = account.customer.business_name?.trim();
        const displayName =
          fantasy && business && fantasy !== business
            ? `${fantasy} (${business})`
            : fantasy || business;
        if (displayName) {
          map.set(account.customer.id, displayName);
        }
      }
    }
    return Array.from(map.entries()).map(([value, label]) => ({
      value,
      label,
    }));
  }, [initialData]);

  const columns = useMemo(
    () => createReceivableColumns(orgSlug, customerOptions, []),
    [orgSlug, customerOptions]
  );

  const { table } = useDataTable<ReceivableAccount>({
    data: initialData,
    columns,
    pageCount,
    getRowId: (row) => row.id,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    shallow: false,
    initialState: {
      pagination: { pageIndex: 0, pageSize: 20 },
      columnVisibility: {
        city: false,
        remittance_number: false,
      },
    },
  });

  if (initialData.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HandCoinsIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>Sin cuentas por cobrar</EmptyTitle>
            <EmptyDescription>
              Aún no registras deudas de clientes en esta organización.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DataTable table={table}>
        <DataTableToolbar
          globalFilterPlaceholder="Buscar cliente..."
          table={table}
        >
          <div className="flex gap-2">
            <Button onClick={() => setBulkPaymentOpen(true)}>
              Pago Masivo
            </Button>
            <CollectionsExportButton
              orgSlug={orgSlug}
              table={table}
              variant="receivable"
            />
            <DownloadPaymentsReportButton
              customerOptions={customerOptions}
              orgSlug={orgSlug}
            />
          </div>
        </DataTableToolbar>
      </DataTable>

      <BulkPaymentDialog
        customers={customerOptions.map((opt) => ({
          id: opt.value,
          name: opt.label,
        }))}
        onOpenChange={setBulkPaymentOpen}
        open={bulkPaymentOpen}
        orgSlug={orgSlug}
      />
    </div>
  );
}
