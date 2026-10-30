"use client";

import { type Control, Controller } from "react-hook-form";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { InventoryWarehouseValues } from "@/modules/inventory/hooks/use-inventory-warehouse";

export function InventoryWarehouseSelector(props: {
  control: Control<InventoryWarehouseValues>;
  warehouses?: Array<{ id: string; name: string }>;
  isLoading: boolean;
  error: boolean;
  disabled?: boolean;
}) {
  const onlyWarehouse =
    props.warehouses?.length === 1 ? props.warehouses[0] : null;
  return (
    <div className="space-y-2">
      <Label>Depósito</Label>
      {props.isLoading && <output>Cargando depósitos...</output>}
      {props.error && (
        <p className="text-destructive text-sm">
          No se pudieron cargar los depósitos.
        </p>
      )}
      <Controller
        control={props.control}
        name="warehouseId"
        render={({ field }) =>
          onlyWarehouse &&
          (!field.value || field.value === onlyWarehouse.id) ? (
            <p className="text-sm">{onlyWarehouse.name}</p>
          ) : (
            <Select
              disabled={props.disabled || props.isLoading}
              onValueChange={field.onChange}
              value={field.value ?? ""}
            >
              <SelectTrigger aria-label="Depósito">
                <SelectValue placeholder="Seleccioná un depósito" />
              </SelectTrigger>
              <SelectContent>
                {props.warehouses?.map((warehouse) => (
                  <SelectItem key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
      />
      {props.warehouses?.length === 0 && (
        <p className="text-destructive text-sm">
          No tenés depósitos habilitados.
        </p>
      )}
    </div>
  );
}
