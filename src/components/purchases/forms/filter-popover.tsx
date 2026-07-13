"use client";

import { Check, ChevronsUpDown } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type FilterOption = {
  value: string;
  label: string;
};

type FilterPopoverProps = {
  label: string;
  options: FilterOption[];
  selectedValue: string;
  onSelect: (value: string) => void;
  placeholder: string;
  allLabel?: string;
};

export function FilterPopover({
  label,
  options,
  selectedValue,
  onSelect,
  placeholder,
  allLabel = "Todas",
}: FilterPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedLabel = selectedValue
    ? (options.find((o) => o.value === selectedValue)?.label ?? allLabel)
    : allLabel;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`filter-${label}`}>{label}</Label>
      <Popover onOpenChange={setIsOpen} open={isOpen}>
        <PopoverTrigger asChild>
          <Button
            aria-expanded={isOpen}
            className="w-full justify-between text-left font-normal"
            id={`filter-${label}`}
            role="combobox"
            variant="outline"
          >
            <span className="truncate">{selectedLabel}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[280px] max-w-[90vw] p-0"
          sideOffset={8}
        >
          <Command>
            <CommandInput placeholder={placeholder} />
            <CommandList>
              <CommandEmpty>Sin resultados.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  key="all"
                  onSelect={() => {
                    onSelect("");
                    setIsOpen(false);
                  }}
                  value={allLabel}
                >
                  <span className="flex-1 truncate">{allLabel}</span>
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0 text-primary transition-opacity",
                      selectedValue ? "opacity-0" : "opacity-100"
                    )}
                  />
                </CommandItem>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      onSelect(option.value);
                      setIsOpen(false);
                    }}
                    value={option.label}
                  >
                    <span className="flex-1 truncate">{option.label}</span>
                    <Check
                      className={cn(
                        "h-4 w-4 shrink-0 text-primary transition-opacity",
                        selectedValue === option.value
                          ? "opacity-100"
                          : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
