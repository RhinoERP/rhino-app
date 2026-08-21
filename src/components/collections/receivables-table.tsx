"use client";

import {
  CheckCircleIcon,
  ClockIcon,
  HandCoinsIcon,
  HourglassIcon,
  MagnifyingGlassIcon,
  ShoppingBagIcon,
  XIcon,
} from "@phosphor-icons/react";
import { parseAsString, useQueryState } from "nuqs";
import { type ReactNode, useMemo, useRef, useState } from "react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDataTable } from "@/hooks/use-data-table";
import type { ReceivableAccount } from "@/modules/collections/types";
import { BulkPaymentDialog } from "./bulk-payment-dialog";
import { createReceivableColumns } from "./collection-columns";
import { CollectionsExportButton } from "./collections-export-button";
import { DownloadPaymentsReportButton } from "./download-payments-report-button";
import { RegisterPaymentDialog } from "./register-payment-dialog";

type Option = { value: string; label: string };

function mergeStableOptions(
  stable: React.MutableRefObject<Option[]>,
  incoming: Option[]
) {
  for (const opt of incoming) {
    if (!stable.current.some((o) => o.value === opt.value)) {
      stable.current.push(opt);
    }
  }
}

function buildCustomerOptions(data: ReceivableAccount[]): Option[] {
  const map = new Map<string, string>();
  for (const account of data) {
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
  return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
}

function buildSellerOptions(data: ReceivableAccount[]): Option[] {
  const map = new Map<string, string>();
  for (const account of data) {
    if (account.seller?.id) {
      const name =
        account.seller.name || account.seller.email || account.seller.id;
      if (name && !map.has(account.seller.id)) {
        map.set(account.seller.id, name);
      }
    }
  }
  return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
}

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: ReactNode; color: string }
> = {
  ALL: {
    label: "Todas",
    icon: <ShoppingBagIcon className="h-4 w-4" weight="duotone" />,
    color: "text-slate-500",
  },
  PENDING: {
    label: "Pendientes",
    icon: <ClockIcon className="h-4 w-4" weight="duotone" />,
    color: "text-amber-500",
  },
  PARTIAL: {
    label: "Parciales",
    icon: <HourglassIcon className="h-4 w-4" weight="duotone" />,
    color: "text-orange-500",
  },
  PAID: {
    label: "Pagadas",
    icon: <CheckCircleIcon className="h-4 w-4" weight="duotone" />,
    color: "text-green-500",
  },
};

type ReceivablesTableProps = {
  initialData: ReceivableAccount[];
  orgSlug: string;
  pageCount: number;
  paymentAccountId?: string;
};

export function ReceivablesTable({
  initialData,
  orgSlug,
  pageCount,
  paymentAccountId,
}: ReceivablesTableProps) {
  const [bulkPaymentOpen, setBulkPaymentOpen] = useState(false);

  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withOptions({ shallow: false }).withDefault("")
  );

  const [status, setStatus] = useQueryState(
    "status",
    parseAsString.withOptions({ shallow: false }).withDefault("")
  );
  const [directPaymentAccountId, setDirectPaymentAccountId] = useQueryState(
    "cobrar",
    parseAsString.withOptions({ shallow: false })
  );
  const directPaymentAccount = initialData.find(
    (account) => account.id === (paymentAccountId ?? directPaymentAccountId)
  );

  const handleStatusChange = (value: string) => {
    setStatus(value === "ALL" ? null : value);
  };

  const handleClearFilters = () => {
    setSearch(null);
    setStatus(null);
  };

  const currentStatus = status || "ALL";
  const hasActiveFilters = search || status;

  const everHadData = useRef(false);
  if (initialData.length > 0) {
    everHadData.current = true;
  }

  const stableCustomerOptions = useRef<{ value: string; label: string }[]>([]);
  const stableSellerOptions = useRef<{ value: string; label: string }[]>([]);

  const customerOptions = useMemo(() => {
    const opts = buildCustomerOptions(initialData);
    mergeStableOptions(stableCustomerOptions, opts);
    return stableCustomerOptions.current;
  }, [initialData]);

  const sellerOptions = useMemo(() => {
    const opts = buildSellerOptions(initialData);
    mergeStableOptions(stableSellerOptions, opts);
    return stableSellerOptions.current;
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
    clearOnDefault: true,
    debounceMs: 0,
    initialState: {
      pagination: { pageIndex: 0, pageSize: 20 },
      columnVisibility: {
        city: false,
        remittance_number: false,
      },
    },
  });

  const isDataEmpty = initialData.length === 0;

  if (isDataEmpty && !hasActiveFilters && !everHadData.current) {
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
      <Tabs
        className="w-full"
        onValueChange={handleStatusChange}
        value={currentStatus}
      >
        <TabsList>
          {Object.entries(STATUS_CONFIG).map(([key, config]) => (
            <TabsTrigger key={key} value={key}>
              <span className={config.color}>{config.icon}</span>
              <span className="ml-1.5">{config.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

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
                  }}
                  placeholder="Buscar cliente..."
                  value={search}
                />
              </div>
              {hasActiveFilters && (
                <Button
                  aria-label="Limpiar filtros"
                  className="border-dashed"
                  onClick={handleClearFilters}
                  size="sm"
                  variant="outline"
                >
                  <XIcon />
                  Limpiar filtros
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
      {directPaymentAccount ? (
        <RegisterPaymentDialog
          accountId={directPaymentAccount.id}
          counterpartyId={directPaymentAccount.customer.id}
          counterpartyName={directPaymentAccount.customer.business_name}
          currency={directPaymentAccount.currency}
          dueDate={directPaymentAccount.due_date}
          onOpenChange={(open) => {
            if (!open) {
              setDirectPaymentAccountId(null);
            }
          }}
          open={Boolean(directPaymentAccountId)}
          orgSlug={orgSlug}
          pendingBalance={directPaymentAccount.pending_balance}
          supplierId={directPaymentAccount.supplier?.id ?? null}
          totalAmount={directPaymentAccount.total_amount}
          trigger={<span className="hidden" />}
          type="receivable"
        />
      ) : null}
    </div>
  );
}
