"use client";

import { useState } from "react";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { ARGENTINE_BANKS } from "@/modules/treasury/constants/argentine-banks";

const OTHER_VALUE = "__otro__";

const BANK_OPTIONS = [
  ...ARGENTINE_BANKS.map((bank) => ({ value: bank, label: bank })),
  { value: OTHER_VALUE, label: "Otro…" },
];

const KNOWN_BANKS: readonly string[] = ARGENTINE_BANKS;

type BankSelectProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
};

export function BankSelect({ id, value, onChange }: BankSelectProps) {
  const [otherSelected, setOtherSelected] = useState(false);

  // Un valor guardado que no está en la lista se edita como texto libre.
  const isOther =
    otherSelected || (value !== "" && !KNOWN_BANKS.includes(value));

  function handleSelect(selected: string) {
    if (selected === OTHER_VALUE) {
      setOtherSelected(true);
      onChange("");
      return;
    }
    setOtherSelected(false);
    onChange(selected);
  }

  return (
    <div className="grid gap-2">
      <Combobox
        className="w-full"
        emptyText="No se encontró el banco"
        onChange={handleSelect}
        options={BANK_OPTIONS}
        placeholder="Seleccionar banco"
        searchPlaceholder="Buscar banco..."
        value={isOther ? OTHER_VALUE : value}
      />
      {isOther && (
        <Input
          aria-label="Nombre del banco"
          id={id}
          maxLength={100}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Nombre del banco"
          value={value}
        />
      )}
    </div>
  );
}
