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
import type { ReceiptWarehouseContext } from "@/modules/purchases/utils/receipt-warehouse";
import type { ReceiptFormValues } from "./purchase-receipt";

export function ReceiptWarehouseSelector(props: {
  control: Control<ReceiptFormValues>;
  context?: ReceiptWarehouseContext;
  isLoading: boolean;
  error: string | null;
  disabled: boolean;
  frozen: boolean;
}) {
  const { context } = props;
  const fixedWarehouse =
    context?.lockedWarehouse ??
    (context?.warehouses.length === 1 ? context.warehouses[0] : null);
  const isLinked = Boolean(context?.lockedWarehouse);
  return (
    <section className="space-y-2 rounded-md border p-4">
      <Label htmlFor="receipt-warehouse">Depósito de recepción</Label>
      {props.isLoading && <output>Cargando depósitos...</output>}
      {props.error && <p className="text-destructive text-sm">{props.error}</p>}
      <Controller
        control={props.control}
        name="warehouseId"
        render={({ field, fieldState }) => (
          <>
            {fixedWarehouse &&
            (isLinked || !field.value || field.value === fixedWarehouse.id) ? (
              <p className="text-sm">
                {fixedWarehouse.name}
                {context?.lockedWarehouse && " · Heredado del pedido"}
              </p>
            ) : (
              <Select
                disabled={props.disabled || props.frozen}
                onValueChange={field.onChange}
                value={field.value ?? ""}
              >
                <SelectTrigger id="receipt-warehouse">
                  <SelectValue placeholder="Seleccioná un depósito" />
                </SelectTrigger>
                <SelectContent>
                  {context?.warehouses.map((warehouse) => (
                    <SelectItem key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {fieldState.error && (
              <p className="text-destructive text-sm">
                {fieldState.error.message}
              </p>
            )}
          </>
        )}
      />
      {context?.warehouses.length === 0 && (
        <p className="text-destructive text-sm">
          No tenés un depósito habilitado para esta recepción.
        </p>
      )}
      {context?.lockedWarehouse &&
        !context.warehouses.some(
          (row) => row.id === context.lockedWarehouse?.id
        ) && (
          <p className="text-destructive text-sm">
            El depósito del pedido está inactivo o no está asignado a tu
            usuario.
          </p>
        )}
      <p className="text-muted-foreground text-xs">
        {props.frozen
          ? "El depósito queda fijado para los reintentos de esta recepción."
          : "Todos los artículos de esta entrega ingresan en el mismo depósito."}
      </p>
    </section>
  );
}
