"use client";

import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { type ReactNode, useTransition } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { shouldShowStockWarehouseFilter } from "@/modules/inventory/utils/warehouse-presentation";

export function StockWarehouseScope({
  warehouses,
  children,
}: {
  warehouses: {
    id: string;
    name: string;
    is_active: boolean;
    is_default?: boolean;
  }[];
  children: ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const [{ deposito }, setScope] = useQueryStates(
    { deposito: parseAsString, page: parseAsInteger.withDefault(1) },
    { shallow: false, history: "replace", startTransition, scroll: false }
  );
  if (!shouldShowStockWarehouseFilter(warehouses, deposito)) {
    const onlyWarehouse = warehouses[0];
    return (
      <div className="space-y-6">
        {onlyWarehouse && !onlyWarehouse.is_default && (
          <p className="text-muted-foreground text-sm">
            Depósito: {onlyWarehouse.name}
          </p>
        )}
        {warehouses.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No tenés depósitos accesibles.
          </p>
        )}
        {children}
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor="stock-warehouse">Depósito</Label>
        <Select
          disabled={pending}
          onValueChange={(value) =>
            setScope({ deposito: value === "all" ? null : value, page: 1 })
          }
          value={deposito || "all"}
        >
          <SelectTrigger className="w-full sm:w-80" id="stock-warehouse">
            <SelectValue placeholder="Todos los depósitos accesibles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los depósitos accesibles</SelectItem>
            {warehouses.map((warehouse) => (
              <SelectItem key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
                {warehouse.is_active ? "" : " · Inactivo"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {pending && (
          <output className="text-muted-foreground text-sm">
            Actualizando stock e indicadores...
          </output>
        )}
      </div>
      <div
        aria-busy={pending}
        className={
          pending ? "pointer-events-none space-y-6 opacity-50" : "space-y-6"
        }
      >
        {children}
      </div>
    </div>
  );
}
