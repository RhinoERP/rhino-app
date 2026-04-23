"use client";

import { TruckIcon } from "@phosphor-icons/react";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useMemo, useTransition } from "react";
import { toast } from "sonner";
import { CarrierDialog } from "@/components/carriers/carrier-dialog";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Switch } from "@/components/ui/switch";
import { useCarriers } from "@/modules/carriers/hooks/use-carriers";
import { updateOrgSettingsAction } from "@/modules/organizations/actions/update-org-settings.action";
import { createCarrierColumns } from "./columns";

type CarriersDataTableProps = {
  orgSlug: string;
  requireCarrierOnDispatch: boolean;
};

export function CarriersDataTable({
  orgSlug,
  requireCarrierOnDispatch,
}: CarriersDataTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const columns = useMemo(() => createCarrierColumns(orgSlug), [orgSlug]);
  const { data = [] } = useCarriers(orgSlug);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
    initialState: { pagination: { pageSize: 10 } },
  });

  const handleToggle = (checked: boolean) => {
    startTransition(async () => {
      const result = await updateOrgSettingsAction(orgSlug, {
        require_carrier_on_dispatch: checked,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(
        checked
          ? "Transporte requerido al despachar"
          : "Transporte opcional al despachar"
      );
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <p className="font-medium text-sm">
            Requerir transporte al despachar
          </p>
          <p className="text-muted-foreground text-xs">
            Si está activo, no se podrá generar el remito sin seleccionar un
            transporte.
          </p>
        </div>
        <Switch
          checked={requireCarrierOnDispatch}
          disabled={isPending}
          onCheckedChange={handleToggle}
        />
      </div>

      {data.length === 0 ? (
        <div className="rounded-md border">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TruckIcon className="size-6" weight="duotone" />
              </EmptyMedia>
              <EmptyTitle>No hay transportes</EmptyTitle>
              <EmptyDescription>
                Aún no agregaste ningún transporte a esta organización.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <CarrierDialog
                onCreated={() => router.refresh()}
                orgSlug={orgSlug}
              />
            </EmptyContent>
          </Empty>
        </div>
      ) : (
        <div className="space-y-4">
          <DataTable table={table}>
            <DataTableToolbar
              globalFilterPlaceholder="Buscar transportes..."
              table={table}
            />
          </DataTable>
        </div>
      )}
    </div>
  );
}
