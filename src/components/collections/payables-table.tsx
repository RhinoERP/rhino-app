"use client";

import { BankIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
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
import { useDataTable } from "@/hooks/use-data-table";
import type { PayableAccount } from "@/modules/collections/types";
import { createPayableColumns } from "./collection-columns";
import { CollectionsExportButton } from "./collections-export-button";

type PayablesTableProps = {
  initialData: PayableAccount[];
  orgSlug: string;
  pageCount: number;
};

export function PayablesTable({
  initialData,
  orgSlug,
  pageCount,
}: PayablesTableProps) {
  const [bulkPaymentDialogOpen, setBulkPaymentDialogOpen] = useState(false);

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

  if (initialData.length === 0) {
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
          globalFilterPlaceholder="Buscar proveedor..."
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
        orgSlug={orgSlug}
        suppliers={supplierOptions.map((s) => ({ id: s.value, name: s.label }))}
      />
    </div>
  );
}
