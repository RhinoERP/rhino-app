"use client";

import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCarriers } from "@/modules/carriers/hooks/use-carriers";
import { useCompletedRouteSheets } from "@/modules/route-sheets/hooks/use-completed-route-sheets";
import type { RouteSheetWithSales } from "@/modules/route-sheets/types";
import { RouteSheetCarrierGroup } from "./route-sheet-carrier-group";

type CompletedRouteSheetsSectionProps = {
  canManage: boolean;
  canRead: boolean;
  orgSlug: string;
};

export function CompletedRouteSheetsSection({
  canManage,
  canRead,
  orgSlug,
}: CompletedRouteSheetsSectionProps) {
  const [open, setOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [carrierId, setCarrierId] = useState("");
  const [saleNumber, setSaleNumber] = useState("");
  const [debouncedSaleNumber, setDebouncedSaleNumber] = useState("");
  const { data: carriers = [] } = useCarriers(orgSlug);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSaleNumber(saleNumber), 400);
    return () => clearTimeout(timer);
  }, [saleNumber]);

  const { data, isLoading, isError } = useCompletedRouteSheets(
    orgSlug,
    {
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      carrierId: carrierId || undefined,
      saleNumber: debouncedSaleNumber || undefined,
    },
    open
  );

  const hasFilters = Boolean(dateFrom || dateTo || carrierId || saleNumber);

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setCarrierId("");
    setSaleNumber("");
    setDebouncedSaleNumber("");
  };

  return (
    <Collapsible className="space-y-3" onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger asChild>
        <Button size="sm" variant="outline">
          {open ? "Ocultar" : "Ver"} hojas de ruta completadas
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        {open && (
          <div className="space-y-3 rounded-md border p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <label
                  className="font-medium text-muted-foreground text-xs"
                  htmlFor="rs-archived-date-from"
                >
                  Desde
                </label>
                <Input
                  id="rs-archived-date-from"
                  onChange={(event) => setDateFrom(event.target.value)}
                  type="date"
                  value={dateFrom}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  className="font-medium text-muted-foreground text-xs"
                  htmlFor="rs-archived-date-to"
                >
                  Hasta
                </label>
                <Input
                  id="rs-archived-date-to"
                  onChange={(event) => setDateTo(event.target.value)}
                  type="date"
                  value={dateTo}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  className="font-medium text-muted-foreground text-xs"
                  htmlFor="rs-archived-carrier"
                >
                  Transporte
                </label>
                <Select
                  onValueChange={(value) =>
                    setCarrierId(value === "__all__" ? "" : value)
                  }
                  value={carrierId}
                >
                  <SelectTrigger id="rs-archived-carrier">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos</SelectItem>
                    {carriers.map((carrier) => (
                      <SelectItem key={carrier.id} value={carrier.id}>
                        {carrier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label
                  className="font-medium text-muted-foreground text-xs"
                  htmlFor="rs-archived-sale"
                >
                  N° de venta
                </label>
                <Input
                  id="rs-archived-sale"
                  onChange={(event) => setSaleNumber(event.target.value)}
                  placeholder="Ej: 123"
                  value={saleNumber}
                />
              </div>
            </div>

            {hasFilters && (
              <div className="flex justify-end">
                <Button
                  onClick={clearFilters}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Limpiar filtros
                </Button>
              </div>
            )}

            <CompletedRouteSheetsList
              canManage={canManage}
              canRead={canRead}
              isError={isError}
              isLoading={isLoading}
              orgSlug={orgSlug}
              routeSheets={data?.routeSheets ?? []}
            />
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

type CompletedRouteSheetsListProps = {
  canManage: boolean;
  canRead: boolean;
  isLoading: boolean;
  isError: boolean;
  orgSlug: string;
  routeSheets: RouteSheetWithSales[];
};

function CompletedRouteSheetsList({
  canManage,
  canRead,
  isLoading,
  isError,
  orgSlug,
  routeSheets,
}: CompletedRouteSheetsListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }, (_, index) => `archived-${index}`).map(
          (key) => (
            <Skeleton className="h-20 w-full" key={key} />
          )
        )}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
        No se pudieron cargar las hojas de ruta completadas.
      </p>
    );
  }

  if (routeSheets.length === 0) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <MagnifyingGlassIcon className="h-4 w-4" />
        No hay hojas de ruta completadas que coincidan con la búsqueda.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {routeSheets.map((routeSheet) => (
        <RouteSheetCarrierGroup
          canManage={canManage}
          canRead={canRead}
          key={routeSheet.id}
          orgSlug={orgSlug}
          routeSheet={routeSheet}
        />
      ))}
    </div>
  );
}
