"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getWarehouseFieldPresentation,
  type WarehouseOption,
} from "@/modules/inventory/utils/warehouse-presentation";

type OperationalWarehouseFieldProps = {
  warehouses: WarehouseOption[];
  value?: string;
  onValueChange: (value: string) => void;
  id: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  description?: string;
};

export function OperationalWarehouseField({
  warehouses,
  value,
  onValueChange,
  id,
  disabled,
  readOnly,
  required,
  description,
}: OperationalWarehouseFieldProps) {
  const presentation = getWarehouseFieldPresentation(
    warehouses,
    value,
    readOnly
  );
  if (presentation === "hidden") {
    return null;
  }
  const selected = warehouses.find((warehouse) => warehouse.id === value);
  return (
    <div className="space-y-2">
      <Label htmlFor={presentation === "select" ? id : undefined}>
        Depósito{required && presentation === "select" ? " *" : ""}
      </Label>
      {presentation === "select" ? (
        <Select
          disabled={disabled}
          onValueChange={onValueChange}
          value={value ?? ""}
        >
          <SelectTrigger className="w-full" id={id}>
            <SelectValue placeholder="Seleccioná un depósito" />
          </SelectTrigger>
          <SelectContent>
            {warehouses.map((warehouse) => (
              <SelectItem key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p
          className={
            presentation === "empty" ? "text-destructive text-sm" : "text-sm"
          }
        >
          {presentation === "empty"
            ? "No tenés depósitos habilitados para esta operación."
            : (selected?.name ??
              "El depósito original no está disponible para tu usuario.")}
        </p>
      )}
      {description && (
        <p className="text-muted-foreground text-xs">{description}</p>
      )}
    </div>
  );
}
