"use client";

import { CaretUpDownIcon, CheckIcon, XIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import type { Tax } from "@/modules/taxes/types";

type PurchaseTaxSelectorProps = {
  taxes: Tax[];
  selectedTaxIds: string[];
  onTaxesChange: (taxIds: string[]) => void;
  disabled?: boolean;
  frozenTaxes?: Array<{ taxId: string; name: string; rate: number }>;
};

export function PurchaseTaxSelector({
  taxes,
  selectedTaxIds,
  onTaxesChange,
  disabled = false,
  frozenTaxes = [],
}: PurchaseTaxSelectorProps) {
  const [open, setOpen] = useState(false);

  const selectedTaxes = selectedTaxIds.flatMap((id) => {
    const saved = frozenTaxes.find(
      (savedTax, index) => (savedTax.taxId || `deleted-${index}`) === id
    );
    const active = taxes.find((activeTax) => activeTax.id === id);
    const selectedTax = saved ?? active;
    return selectedTax
      ? [{ id, name: selectedTax.name, rate: selectedTax.rate }]
      : [];
  });

  const handleTaxToggle = (taxId: string) => {
    const newTaxIds = selectedTaxIds.includes(taxId)
      ? selectedTaxIds.filter((id) => id !== taxId)
      : [...selectedTaxIds, taxId];
    onTaxesChange(newTaxIds);
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          className="h-auto min-h-8 w-full justify-between hover:bg-transparent"
          disabled={disabled}
          role="combobox"
          variant="outline"
        >
          <div className="flex flex-wrap items-center gap-1 pr-2.5">
            {selectedTaxes.length > 0 ? (
              selectedTaxes.map((tax) => (
                <Badge className="rounded-sm" key={tax.id} variant="outline">
                  {tax.name} ({tax.rate}%)
                  {!disabled && (
                    <Button
                      aria-label={`Eliminar ${tax.name}`}
                      asChild
                      className="size-4"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTaxToggle(tax.id);
                      }}
                      size="icon"
                      variant="ghost"
                    >
                      <span>
                        <XIcon className="size-3" />
                      </span>
                    </Button>
                  )}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">
                {disabled
                  ? "Sin impuestos seleccionados"
                  : "Seleccione impuestos (opcional)"}
              </span>
            )}
          </div>
          <CaretUpDownIcon
            aria-hidden="true"
            className="shrink-0 text-muted-foreground/80"
          />
        </Button>
      </PopoverTrigger>
      {!disabled && (
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) p-0"
        >
          <Command>
            <CommandInput placeholder="Buscar impuesto..." />
            <CommandList>
              <CommandEmpty>No se encontraron impuestos.</CommandEmpty>
              <CommandGroup>
                {taxes.map((tax) => (
                  <CommandItem
                    key={tax.id}
                    onSelect={() => handleTaxToggle(tax.id)}
                    value={tax.name}
                  >
                    <span className="truncate">
                      {tax.name} ({tax.rate}%)
                    </span>
                    {selectedTaxIds.includes(tax.id) && (
                      <CheckIcon className="ml-auto" size={16} />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      )}
    </Popover>
  );
}
