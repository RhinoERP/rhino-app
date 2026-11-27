"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  normalizeCaseUnitQuantity,
  splitCaseUnitQuantity,
} from "@/modules/inventory/utils/case-units";

type CaseUnitQuantityFieldsProps = {
  totalUnits: number;
  unitsPerBox: number;
  onChange: (totalUnits: number) => void;
  disabled?: boolean;
  compact?: boolean;
  showTotalUnitsInput?: boolean;
};

export function CaseUnitQuantityFields({
  totalUnits,
  unitsPerBox,
  onChange,
  disabled = false,
  compact = false,
  showTotalUnitsInput = false,
}: CaseUnitQuantityFieldsProps) {
  const id = useId();
  const quantity = splitCaseUnitQuantity(totalUnits, unitsPerBox);
  const inputClassName = compact ? "h-8 w-full" : "w-full";

  const updateBoxes = (value: string) => {
    const boxes = Number(value || 0);
    if (
      !Number.isSafeInteger(boxes) ||
      boxes < 0 ||
      !Number.isSafeInteger(boxes * unitsPerBox + quantity.units)
    ) {
      return;
    }
    onChange(
      normalizeCaseUnitQuantity({ boxes, units: quantity.units }, unitsPerBox)
    );
  };

  const updateUnits = (value: string) => {
    const units = Number(value || 0);
    if (
      !Number.isSafeInteger(units) ||
      units < 0 ||
      !Number.isSafeInteger(quantity.boxes * unitsPerBox + units)
    ) {
      return;
    }
    onChange(
      normalizeCaseUnitQuantity({ boxes: quantity.boxes, units }, unitsPerBox)
    );
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1">
        <Label
          className={compact ? "text-xs" : undefined}
          htmlFor={`${id}-boxes`}
        >
          Cajas
        </Label>
        <Input
          aria-label="Cajas"
          className={inputClassName}
          disabled={disabled}
          id={`${id}-boxes`}
          inputMode="numeric"
          min={0}
          onChange={(event) => updateBoxes(event.target.value)}
          placeholder="0"
          step="1"
          type="number"
          value={quantity.boxes || ""}
        />
      </div>
      <div className="space-y-1">
        <Label
          className={compact ? "text-xs" : undefined}
          htmlFor={`${id}-units`}
        >
          Unidades sueltas
        </Label>
        <Input
          aria-label="Unidades sueltas"
          className={inputClassName}
          disabled={disabled}
          id={`${id}-units`}
          inputMode="numeric"
          min={0}
          onChange={(event) => updateUnits(event.target.value)}
          placeholder="0"
          step="1"
          type="number"
          value={quantity.units || ""}
        />
      </div>
      {showTotalUnitsInput && (
        <div className="col-span-2 space-y-1">
          <Label
            className={compact ? "text-xs" : undefined}
            htmlFor={`${id}-total-units`}
          >
            Unidades totales
          </Label>
          <Input
            aria-label="Unidades totales"
            className={inputClassName}
            disabled={disabled}
            id={`${id}-total-units`}
            inputMode="numeric"
            min={0}
            onChange={(event) => {
              const value = Number(event.target.value || 0);
              if (Number.isSafeInteger(value) && value >= 0) {
                onChange(value);
              }
            }}
            placeholder="0"
            step="1"
            type="number"
            value={totalUnits || ""}
          />
        </div>
      )}
    </div>
  );
}
