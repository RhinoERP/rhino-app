"use client";

import { type KeyboardEventHandler, useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  splitCaseUnitQuantity,
  tryNormalizeCaseUnitQuantity,
} from "@/modules/inventory/utils/case-units";

type CaseUnitQuantityFieldsProps = {
  totalUnits: number;
  unitsPerBox: number;
  onChange: (totalUnits: number) => void;
  disabled?: boolean;
  compact?: boolean;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  onBlur?: () => void;
};

function buildDraft(totalUnits: number, unitsPerBox: number) {
  const quantity = splitCaseUnitQuantity(totalUnits, unitsPerBox);
  return {
    boxes: String(quantity.boxes),
    units: String(quantity.units),
    totalUnits,
    unitsPerBox,
  };
}

export function CaseUnitQuantityFields({
  totalUnits,
  unitsPerBox,
  onChange,
  disabled = false,
  compact = false,
  onKeyDown,
  onBlur,
}: CaseUnitQuantityFieldsProps) {
  const id = useId();
  const [draft, setDraft] = useState(() => buildDraft(totalUnits, unitsPerBox));
  // Follow external quantity changes without replacing a valid in-progress
  // entry (e.g. 6 boxes + 13 units) with its normalized representation mid-type.
  if (draft.totalUnits !== totalUnits || draft.unitsPerBox !== unitsPerBox) {
    setDraft(buildDraft(totalUnits, unitsPerBox));
  }
  const inputClassName = compact ? "h-8 w-full" : "w-full";

  const update = (field: "boxes" | "units", value: string) => {
    const next = { ...draft, [field]: value };
    const nextTotal = tryNormalizeCaseUnitQuantity(
      { boxes: Number(next.boxes), units: Number(next.units) },
      unitsPerBox
    );
    if (nextTotal === null) {
      return;
    }
    setDraft({ ...next, totalUnits: nextTotal });
    onChange(nextTotal);
  };

  const normalizeOnBlur = () => {
    setDraft(buildDraft(draft.totalUnits, unitsPerBox));
    onBlur?.();
  };

  return (
    <div className="grid min-w-0 grid-cols-2 gap-2">
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
          onBlur={normalizeOnBlur}
          onChange={(event) => update("boxes", event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="0"
          step="1"
          type="number"
          value={draft.boxes}
        />
      </div>
      <div className="space-y-1">
        <Label
          className={compact ? "text-xs" : undefined}
          htmlFor={`${id}-units`}
        >
          Unidades
        </Label>
        <Input
          aria-label="Unidades sueltas"
          className={inputClassName}
          disabled={disabled}
          id={`${id}-units`}
          inputMode="numeric"
          min={0}
          onBlur={normalizeOnBlur}
          onChange={(event) => update("units", event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="0"
          step="1"
          type="number"
          value={draft.units}
        />
      </div>
    </div>
  );
}
