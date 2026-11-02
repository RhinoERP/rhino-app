"use client";

import { type Control, Controller } from "react-hook-form";
import { OperationalWarehouseField } from "@/components/stock/operational-warehouse-field";
import type { InventoryWarehouseValues } from "@/modules/inventory/hooks/use-inventory-warehouse";
import type { WarehouseOption } from "@/modules/inventory/utils/warehouse-presentation";

export function InventoryWarehouseSelector(props: {
  control: Control<InventoryWarehouseValues>;
  warehouses?: WarehouseOption[];
  isLoading: boolean;
  error: boolean;
  disabled?: boolean;
}) {
  if (props.isLoading) {
    return <output>Cargando depósitos...</output>;
  }
  if (props.error) {
    return (
      <p className="text-destructive text-sm">
        No se pudieron cargar los depósitos.
      </p>
    );
  }
  return (
    <Controller
      control={props.control}
      name="warehouseId"
      render={({ field }) => (
        <OperationalWarehouseField
          disabled={props.disabled}
          id="inventory-warehouse"
          onValueChange={field.onChange}
          value={field.value}
          warehouses={props.warehouses ?? []}
        />
      )}
    />
  );
}
