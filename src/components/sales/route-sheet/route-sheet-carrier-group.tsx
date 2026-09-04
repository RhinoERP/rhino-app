"use client";

import { MagnifyingGlassIcon, PlusIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { useCarriers } from "@/modules/carriers/hooks/use-carriers";
import { generateRemittanceNumber } from "@/modules/organizations/actions/generate-remittance-number.action";
import { getRemittanceSettings } from "@/modules/organizations/actions/get-remittance-settings.action";
import { useRouteSheetPdf } from "@/modules/route-sheets/hooks/use-route-sheet-pdf";
import { useRouteSheets } from "@/modules/route-sheets/hooks/use-route-sheets";
import { useRouteSheetMutations } from "@/modules/route-sheets/hooks/use-route-sheets-mutations";
import type {
  RouteSheetSale,
  RouteSheetWithSales,
} from "@/modules/route-sheets/types";
import { RouteSheetHeader } from "./route-sheet-header";
import { RouteSheetSaleRow } from "./route-sheet-sale-row";

type RouteSheetCarrierGroupProps = {
  canManage: boolean;
  canRead: boolean;
  orgSlug: string;
  routeSheet: RouteSheetWithSales;
};

type AddSalesDialogProps = {
  orgSlug: string;
  routeSheet: RouteSheetWithSales;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function uniqueFilterOptions(values: (string | null | undefined)[]): {
  value: string;
  label: string;
}[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value }));
}

type SaleFilter = {
  search: string;
  city: string;
  deliveryCity: string;
  province: string;
  carrierId: string;
  dateFrom: string;
  dateTo: string;
};

function makeSaleFilter(filter: SaleFilter) {
  const normSearch = filter.search.trim().toLowerCase();
  return (sale: RouteSheetSale): boolean => {
    const matchesSearch =
      !normSearch ||
      sale.customer_name.toLowerCase().includes(normSearch) ||
      String(sale.sale_number ?? "").includes(normSearch);
    const matchesCity = !filter.city || sale.customer_city === filter.city;
    const matchesDeliveryCity =
      !filter.deliveryCity ||
      sale.customer_delivery_city === filter.deliveryCity;
    const matchesProvince =
      !filter.province || sale.customer_province === filter.province;
    const matchesCarrier =
      !filter.carrierId || sale.carrier_id === filter.carrierId;
    const matchesFrom =
      !filter.dateFrom ||
      Boolean(sale.sale_date && sale.sale_date >= filter.dateFrom);
    const matchesTo =
      !filter.dateTo ||
      Boolean(sale.sale_date && sale.sale_date <= filter.dateTo);
    return (
      matchesSearch &&
      matchesCity &&
      matchesDeliveryCity &&
      matchesProvince &&
      matchesCarrier &&
      matchesFrom &&
      matchesTo
    );
  };
}

function AddSalesDialog({
  orgSlug,
  routeSheet,
  open,
  onOpenChange,
}: AddSalesDialogProps) {
  const { data } = useRouteSheets(orgSlug);
  const { addSales } = useRouteSheetMutations(orgSlug);
  const { data: carriers = [] } = useCarriers(orgSlug);
  const availableSales = data?.availableSales ?? [];

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [remittances, setRemittances] = useState<Record<string, string>>({});
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [city, setCity] = useState<string>("");
  const [deliveryCity, setDeliveryCity] = useState<string>("");
  const [province, setProvince] = useState<string>("");
  const [carrierId, setCarrierId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const hasActiveFilters =
    Boolean(search.trim()) ||
    Boolean(city) ||
    Boolean(deliveryCity) ||
    Boolean(province) ||
    Boolean(carrierId) ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  const clearFilters = useCallback(() => {
    setSearch("");
    setCity("");
    setDeliveryCity("");
    setProvince("");
    setCarrierId("");
    setDateFrom("");
    setDateTo("");
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    setSelectedIds(new Set());
    setRemittances({});
    setErrorMessage(null);
    clearFilters();
    getRemittanceSettings(orgSlug).then((settings) => {
      setAutoEnabled(Boolean(settings.success && settings.data?.autoEnabled));
    });
  }, [open, orgSlug, clearFilters]);

  const cityOptions = useMemo(
    () => uniqueFilterOptions(availableSales.map((s) => s.customer_city)),
    [availableSales]
  );

  const deliveryCityOptions = useMemo(
    () =>
      uniqueFilterOptions(availableSales.map((s) => s.customer_delivery_city)),
    [availableSales]
  );

  const provinceOptions = useMemo(
    () => uniqueFilterOptions(availableSales.map((s) => s.customer_province)),
    [availableSales]
  );

  const filteredSales = useMemo(
    () =>
      availableSales.filter(
        makeSaleFilter({
          search,
          city,
          deliveryCity,
          province,
          carrierId,
          dateFrom,
          dateTo,
        })
      ),
    [
      availableSales,
      search,
      city,
      deliveryCity,
      province,
      carrierId,
      dateFrom,
      dateTo,
    ]
  );

  const toggleSale = (sale: RouteSheetSale) => {
    const isAdding = !selectedIds.has(sale.id);

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sale.id)) {
        next.delete(sale.id);
      } else {
        next.add(sale.id);
      }
      return next;
    });

    if (
      isAdding &&
      sale.status === "CONFIRMED" &&
      autoEnabled &&
      !remittances[sale.id]?.trim()
    ) {
      generateRemittanceNumber(orgSlug).then((result) => {
        const number = result.number;
        if (result.success && number) {
          setRemittances((current) => ({ ...current, [sale.id]: number }));
        }
      });
    }
  };

  const updateRemittance = (saleId: string, value: string) => {
    setRemittances((prev) => ({ ...prev, [saleId]: value }));
  };

  const handleSubmit = async () => {
    setErrorMessage(null);
    const selected = filteredSales.filter((sale) => selectedIds.has(sale.id));

    if (selected.length === 0) {
      setErrorMessage("Seleccioná al menos una venta");
      return;
    }

    const missing = selected.filter(
      (sale) => sale.status === "CONFIRMED" && !remittances[sale.id]?.trim()
    );
    if (missing.length > 0) {
      setErrorMessage(
        "Completá el número de remito de las ventas seleccionadas"
      );
      return;
    }

    const remitMap: Record<string, string> = {};
    for (const sale of selected) {
      if (sale.status === "CONFIRMED") {
        remitMap[sale.id] = remittances[sale.id].trim();
      }
    }

    setIsPending(true);
    try {
      await addSales.mutateAsync({
        routeSheetId: routeSheet.id,
        saleIds: selected.map((sale) => sale.id),
        remittances: remitMap,
      });
      onOpenChange(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Error al agregar las ventas a la hoja de ruta"
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Agregar ventas a la hoja de ruta</DialogTitle>
          <DialogDescription>
            Seleccioná las ventas confirmadas que viajan con{" "}
            {routeSheet.carrier?.name ?? "el transporte"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-3 rounded-md border p-3">
            <div className="relative">
              <MagnifyingGlassIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por cliente o número de venta..."
                value={search}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <label
                  className="font-medium text-muted-foreground text-xs"
                  htmlFor="rs-filter-city"
                >
                  Ciudad
                </label>
                <Select
                  onValueChange={(value) =>
                    setCity(value === "__all__" ? "" : value)
                  }
                  value={city}
                >
                  <SelectTrigger id="rs-filter-city">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todas</SelectItem>
                    {cityOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label
                  className="font-medium text-muted-foreground text-xs"
                  htmlFor="rs-filter-delivery-city"
                >
                  Ciudad de entrega
                </label>
                <Select
                  onValueChange={(value) =>
                    setDeliveryCity(value === "__all__" ? "" : value)
                  }
                  value={deliveryCity}
                >
                  <SelectTrigger id="rs-filter-delivery-city">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todas</SelectItem>
                    {deliveryCityOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label
                  className="font-medium text-muted-foreground text-xs"
                  htmlFor="rs-filter-province"
                >
                  Provincia
                </label>
                <Select
                  onValueChange={(value) =>
                    setProvince(value === "__all__" ? "" : value)
                  }
                  value={province}
                >
                  <SelectTrigger id="rs-filter-province">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todas</SelectItem>
                    {provinceOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label
                  className="font-medium text-muted-foreground text-xs"
                  htmlFor="rs-filter-carrier"
                >
                  Transporte
                </label>
                <Select
                  onValueChange={(value) =>
                    setCarrierId(value === "__all__" ? "" : value)
                  }
                  value={carrierId}
                >
                  <SelectTrigger id="rs-filter-carrier">
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
                  htmlFor="rs-filter-date-from"
                >
                  Desde
                </label>
                <Input
                  id="rs-filter-date-from"
                  onChange={(e) => setDateFrom(e.target.value)}
                  type="date"
                  value={dateFrom}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  className="font-medium text-muted-foreground text-xs"
                  htmlFor="rs-filter-date-to"
                >
                  Hasta
                </label>
                <Input
                  id="rs-filter-date-to"
                  onChange={(e) => setDateTo(e.target.value)}
                  type="date"
                  value={dateTo}
                />
              </div>
            </div>

            {hasActiveFilters && (
              <div className="flex items-center justify-end">
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
          </div>

          {filteredSales.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No hay ventas que coincidan con los filtros.
            </p>
          ) : (
            <div className="max-h-[46dvh] space-y-2 overflow-y-auto pr-1 sm:max-h-72">
              {filteredSales.map((sale) => (
                <div
                  className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2"
                  key={sale.id}
                >
                  <Checkbox
                    checked={selectedIds.has(sale.id)}
                    onCheckedChange={() => toggleSale(sale)}
                  />
                  <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">
                        #{sale.sale_number ?? "—"}
                      </span>
                      <Badge variant="secondary">Confirmada</Badge>
                    </div>
                    <p className="truncate text-muted-foreground text-sm">
                      {sale.customer_name}
                    </p>
                  </div>

                  <span className="shrink-0 font-medium text-sm tabular-nums">
                    {formatCurrency(sale.total_amount)}
                  </span>

                  <div className="w-full shrink-0 sm:w-36">
                    <Input
                      onChange={(ev) =>
                        updateRemittance(sale.id, ev.target.value)
                      }
                      placeholder="N° de remito"
                      value={remittances[sale.id] ?? ""}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {errorMessage && (
            <div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
              {errorMessage}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            className="w-full sm:w-auto"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
            variant="outline"
          >
            Cancelar
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={isPending || filteredSales.length === 0}
            onClick={handleSubmit}
          >
            {isPending ? "Agregando..." : "Agregar ventas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RouteSheetCarrierGroup({
  canManage,
  canRead,
  orgSlug,
  routeSheet,
}: RouteSheetCarrierGroupProps) {
  const { updateStatus, removeSale, deleteRouteSheet } =
    useRouteSheetMutations(orgSlug);
  const { downloadRouteSheet, isDownloading } = useRouteSheetPdf({ orgSlug });
  const [expanded, setExpanded] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const handleDownload = () => {
    downloadRouteSheet(routeSheet.id);
  };

  const handleUpdateStatus = async (status: RouteSheetWithSales["status"]) => {
    try {
      await updateStatus.mutateAsync({
        routeSheetId: routeSheet.id,
        status,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la hoja de ruta"
      );
    }
  };

  const handleRemoveSale = async (saleId: string) => {
    try {
      await removeSale.mutateAsync({
        routeSheetId: routeSheet.id,
        saleId,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo quitar la venta de la hoja de ruta"
      );
    }
  };

  const handleDelete = async () => {
    try {
      await deleteRouteSheet.mutateAsync({ routeSheetId: routeSheet.id });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo eliminar la hoja de ruta"
      );
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <RouteSheetHeader
          canManage={canManage}
          canRead={canRead}
          expanded={expanded}
          isDeleting={deleteRouteSheet.isPending}
          isDownloading={isDownloading}
          isUpdatingStatus={updateStatus.isPending}
          onDelete={handleDelete}
          onDownload={handleDownload}
          onToggleExpand={() => setExpanded((prev) => !prev)}
          onUpdateStatus={handleUpdateStatus}
          routeSheet={routeSheet}
        />

        {expanded && (
          <div className="mt-4 space-y-2 border-t pt-4">
            {routeSheet.sales.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Esta hoja de ruta no tiene ventas asignadas.
              </p>
            ) : (
              routeSheet.sales.map((sale) => (
                <RouteSheetSaleRow
                  canManage={canManage}
                  isPending={routeSheet.status === "PENDING"}
                  isRemoving={removeSale.isPending}
                  key={sale.id}
                  onRemove={() => handleRemoveSale(sale.id)}
                  orgSlug={orgSlug}
                  sale={sale}
                />
              ))
            )}

            {canManage && routeSheet.status === "PENDING" && (
              <Button
                onClick={() => setAddOpen(true)}
                size="sm"
                variant="outline"
              >
                <PlusIcon className="mr-1 h-4 w-4" weight="bold" />
                Agregar ventas
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <AddSalesDialog
        onOpenChange={setAddOpen}
        open={addOpen}
        orgSlug={orgSlug}
        routeSheet={routeSheet}
      />
    </Card>
  );
}
