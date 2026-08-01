"use client";

import { BankIcon, MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo, useRef, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { BulkSupplierPaymentDialog } from "@/components/purchases/bulk-supplier-payment-dialog";
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
import type { PayableAccount } from "@/modules/collections/types";
import { createPayableColumns } from "./collection-columns";
import { CollectionsExportButton } from "./collections-export-button";

type PayablesTableProps = {
  initialData: PayableAccount[];
  orgSlug: string;
  orgId?: string;
  pageCount: number;
};

export function PayablesTable({
  initialData,
  orgSlug,
  orgId,
  pageCount,
}: PayablesTableProps) {
  const [bulkPaymentDialogOpen, setBulkPaymentDialogOpen] = useState(false);

  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withOptions({ shallow: false }).withDefault("")
  );

  const everHadData = useRef(false);
  if (initialData.length > 0) {
    everHadData.current = true;
  }

  const supplierOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of initialData) {
      if (account.supplier.id && account.supplier.name) {
        map.set(account.supplier.id, account.supplier.name);
      }
    }
    return Array.from(map.entries()).map(([value, label]) => ({
      value,
      label,
    }));
  }, [initialData]);

  const columns = useMemo(
    () => createPayableColumns(orgSlug, supplierOptions),
    [orgSlug, supplierOptions]
  );

  const { table } = useDataTable<PayableAccount>({
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
    },
  });

  if (initialData.length === 0 && !everHadData.current) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BankIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>Sin cuentas por pagar</EmptyTitle>
            <EmptyDescription>
              Aún no registras deudas con proveedores en esta organización.
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
                  placeholder="Buscar proveedor..."
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
          <Button onClick={() => setBulkPaymentDialogOpen(true)}>
            Pago Masivo
          </Button>
          <CollectionsExportButton
            orgSlug={orgSlug}
            table={table}
            variant="payable"
          />
        </DataTableToolbar>
      </DataTable>

      <BulkSupplierPaymentDialog
        onOpenChange={setBulkPaymentDialogOpen}
        open={bulkPaymentDialogOpen}
        orgId={orgId}
        orgSlug={orgSlug}
        suppliers={supplierOptions.map((s) => ({ id: s.value, name: s.label }))}
      />
    </div>
  );
}
