"use client";

import { Check, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatCurrency } from "@/lib/format";
import type {
  ItemTaxInput,
  ItemTaxSnapshot,
} from "@/modules/taxes/item-tax-calculations";
import type { Tax } from "@/modules/taxes/types";

type Props = {
  productName: string;
  taxes?: ItemTaxInput[];
  productTaxes?: ItemTaxInput[];
  fallbackTaxes: ItemTaxInput[];
  availableTaxes: Tax[];
  calculatedTaxes: ItemTaxSnapshot[];
  currency: string;
  editable: boolean;
  onChange: (taxes: ItemTaxInput[]) => void;
};

function isIva(tax: { taxCodeSnapshot?: string | null }) {
  return tax.taxCodeSnapshot?.trim().toUpperCase().startsWith("IVA_") ?? false;
}

export function PurchaseItemTaxPicker({
  productName,
  taxes,
  productTaxes = [],
  fallbackTaxes,
  availableTaxes,
  calculatedTaxes,
  currency,
  editable,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = taxes ?? productTaxes;
  const effective = selected.length ? selected : fallbackTaxes;
  let label = "Sin impuesto";
  if (selected.length) {
    label = taxes?.some((tax) => tax.source === "manual")
      ? "Impuesto línea"
      : "Impuesto producto";
  } else if (effective.length) {
    label = "Impuesto compra";
  }
  return (
    <div className="min-w-0 space-y-1 text-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground">
          <span className="font-medium">{label}</span>
          {effective.length
            ? `: ${effective.map((tax) => `${tax.name} (${tax.rate}%)`).join(", ")}`
            : null}
        </p>
        {editable && (
          <Popover onOpenChange={setOpen} open={open}>
            <PopoverTrigger asChild>
              <Button
                aria-label={`Cambiar impuestos de ${productName}`}
                className="h-7 w-7 shrink-0"
                size="icon"
                type="button"
                variant="ghost"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <Command>
                <CommandInput placeholder="Buscar impuesto..." />
                <CommandList>
                  <CommandEmpty>No se encontraron impuestos.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => onChange([])}
                      value="usar impuesto de compra"
                    >
                      <span className="flex-1">Usar impuesto de compra</span>
                      {taxes?.length === 0 && <Check className="h-4 w-4" />}
                    </CommandItem>
                    {availableTaxes.map((tax) => (
                      <CommandItem
                        key={tax.id}
                        onSelect={() => {
                          const exists = selected.some(
                            (entry) => entry.taxId === tax.id
                          );
                          onChange(
                            exists
                              ? selected.filter(
                                  (entry) => entry.taxId !== tax.id
                                )
                              : [
                                  ...(isIva({
                                    taxCodeSnapshot: tax.code,
                                  })
                                    ? selected.filter((entry) => !isIva(entry))
                                    : selected),
                                  {
                                    taxId: tax.id,
                                    name: tax.name,
                                    rate: tax.rate,
                                    taxCodeSnapshot: tax.code,
                                    source: "manual",
                                  },
                                ]
                          );
                        }}
                        value={`${tax.name} ${tax.rate}`}
                      >
                        <span className="flex-1">
                          {tax.name} ({tax.rate}%)
                        </span>
                        {selected.some((entry) => entry.taxId === tax.id) && (
                          <Check className="h-4 w-4" />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {calculatedTaxes.map((tax, index) => (
        <p className="text-muted-foreground" key={`${tax.taxId}-${index}`}>
          {tax.name} ({tax.rate}%): base{" "}
          {formatCurrency(tax.baseAmount, currency)} · impuesto{" "}
          {formatCurrency(tax.taxAmount, currency)}
        </p>
      ))}
    </div>
  );
}
