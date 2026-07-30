"use client";

import {
  HandCoinsIcon,
  MagnifyingGlassIcon,
  XIcon,
} from "@phosphor-icons/react";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
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

  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withOptions({ shallow: false }).withDefault("")
  );

  const everHadData = useRef(false);
  if (initialData.length > 0) {
    everHadData.current = true;
  }

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

  const sellerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of initialData) {
      if (account.seller?.id) {
        const name =
          account.seller.name || account.seller.email || account.seller.id;
        if (name && !map.has(account.seller.id)) {
          map.set(account.seller.id, name);
        }
      }
    }
    return Array.from(map.entries()).map(([value, label]) => ({
      value,
      label,
    }));
  }, [initialData]);

  const columns = useMemo(
    () => createReceivableColumns(orgSlug, customerOptions, sellerOptions),
    [orgSlug, customerOptions, sellerOptions]
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

  if (initialData.length === 0 && !everHadData.current) {
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
          searchSlot={
            <>
              <div className="relative">
                <MagnifyingGlassIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="h-8 w-48 pl-8 lg:w-72"
                  onChange={(event) => {
                    setSearch(event.target.value || null);
                    table.setPageIndex(0);
                  }}
                  placeholder="Buscar cliente..."
                  value={search}
                />
              </div>
              {search && (
                <Button
                  aria-label="Limpiar busqueda"
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
            </>
          }
          table={table}
        >
          <Button onClick={() => setBulkPaymentOpen(true)}>Pago Masivo</Button>
          <CollectionsExportButton
            orgSlug={orgSlug}
            table={table}
            variant="receivable"
          />
          <DownloadPaymentsReportButton
            customerOptions={customerOptions}
            orgSlug={orgSlug}
          />
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
