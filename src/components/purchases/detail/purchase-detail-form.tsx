"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, Check, ChevronsUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Supplier } from "@/modules/suppliers/service/suppliers.service";
import type { Tax } from "@/modules/taxes/service/taxes.service";

type PurchaseDetailFormProps = {
  supplierId: string;
  suppliers: Supplier[];
  selectedTaxIds: string[];
  taxes: Tax[];
  purchaseDate: Date;
  paymentDueDate: Date | null;
  remittanceNumber: string;
  isEditingDetails: boolean;
  isSupplierPickerOpen: boolean;
  isTaxesPickerOpen: boolean;
  onSupplierChange: (supplierId: string) => void;
  onSupplierPickerOpenChange: (open: boolean) => void;
  onTaxesPickerOpenChange: (open: boolean) => void;
  onTaxToggle: (taxId: string) => void;
  onPurchaseDateChange: (date: Date) => void;
  onPaymentDueDateChange: (date: Date | null) => void;
  onRemittanceNumberChange: (value: string) => void;
};

export function PurchaseDetailForm({
  supplierId,
  suppliers,
  selectedTaxIds,
  taxes,
  purchaseDate,
  paymentDueDate,
  remittanceNumber,
  isEditingDetails,
  isSupplierPickerOpen,
  isTaxesPickerOpen,
  onSupplierChange,
  onSupplierPickerOpenChange,
  onTaxesPickerOpenChange,
  onTaxToggle,
  onPurchaseDateChange,
  onPaymentDueDateChange,
  onRemittanceNumberChange,
}: PurchaseDetailFormProps) {
  const selectedSupplier = suppliers.find((s) => s.id === supplierId);
  const selectedTaxes = taxes.filter((tax) => selectedTaxIds.includes(tax.id));

  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="supplier">Proveedor</Label>
            <Popover
              onOpenChange={onSupplierPickerOpenChange}
              open={isSupplierPickerOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  aria-expanded={isSupplierPickerOpen}
                  className="w-full justify-between text-left font-normal"
                  disabled={!isEditingDetails}
                  id="supplier"
                  role="combobox"
                  variant="outline"
                >
                  <span className="truncate">
                    {selectedSupplier
                      ? `${selectedSupplier.name}${selectedSupplier.cuit ? ` - CUIT: ${selectedSupplier.cuit}` : ""}`
                      : "Selecciona un proveedor"}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-xs max-w-[90vw] p-0"
                sideOffset={8}
              >
                <Command>
                  <CommandInput placeholder="Buscar proveedor..." />
                  <CommandList>
                    <CommandEmpty>Sin resultados.</CommandEmpty>
                    <CommandGroup>
                      {suppliers.map((supplier) => (
                        <CommandItem
                          key={supplier.id}
                          onSelect={() => {
                            onSupplierChange(supplier.id);
                            onSupplierPickerOpenChange(false);
                          }}
                          value={supplier.name}
                        >
                          <span className="flex-1 truncate">
                            {supplier.name}
                            {supplier.cuit ? ` - CUIT: ${supplier.cuit}` : ""}
                          </span>
                          <Check
                            className={cn(
                              "h-4 w-4 shrink-0 text-primary transition-opacity",
                              supplierId === supplier.id
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
            <p className="text-muted-foreground text-xs">
              Proveedor asignado a la compra.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="taxes">Impuestos</Label>
            <Popover
              onOpenChange={onTaxesPickerOpenChange}
              open={isTaxesPickerOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  aria-expanded={isTaxesPickerOpen}
                  className="h-auto min-h-9 w-full justify-between text-left font-normal"
                  disabled={!isEditingDetails}
                  id="taxes"
                  role="combobox"
                  variant="outline"
                >
                  <div className="flex flex-wrap items-center gap-1.5 pr-2.5">
                    {selectedTaxes.length > 0 ? (
                      selectedTaxes.map((tax) => (
                        <Badge
                          className="rounded-sm"
                          key={tax.id}
                          variant="outline"
                        >
                          {tax.name} ({tax.rate}%)
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground">
                        Seleccione impuestos (opcional)
                      </span>
                    )}
                  </div>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-(--radix-popover-trigger-width) p-0"
                sideOffset={8}
              >
                <Command>
                  <CommandInput placeholder="Buscar impuesto..." />
                  <CommandList>
                    <CommandEmpty>No se encontraron impuestos.</CommandEmpty>
                    <CommandGroup>
                      {taxes.map((tax) => (
                        <CommandItem
                          key={tax.id}
                          onSelect={() => onTaxToggle(tax.id)}
                          value={tax.name}
                        >
                          <span className="flex-1 truncate">
                            {tax.name} ({tax.rate}%)
                          </span>
                          {selectedTaxIds.includes(tax.id) ? (
                            <Check className="h-4 w-4 shrink-0 text-primary" />
                          ) : null}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-muted-foreground text-xs">
              Selecciona los impuestos aplicados a esta compra.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="purchaseDate">Fecha de compra</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !purchaseDate && "text-muted-foreground"
                  )}
                  disabled={!isEditingDetails}
                  id="purchaseDate"
                  variant="outline"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {purchaseDate ? (
                    format(purchaseDate, "PPP", { locale: es })
                  ) : (
                    <span>Seleccione una fecha</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                  initialFocus
                  locale={es}
                  mode="single"
                  onSelect={(date) => onPurchaseDateChange(date ?? new Date())}
                  selected={purchaseDate}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-2">
            <Label htmlFor="paymentDueDate">Fecha de vencimiento</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !paymentDueDate && "text-muted-foreground"
                  )}
                  disabled={!isEditingDetails}
                  id="paymentDueDate"
                  variant="outline"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {paymentDueDate ? (
                    format(paymentDueDate, "PPP", { locale: es })
                  ) : (
                    <span>Seleccione una fecha</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                  disabled={(date) =>
                    purchaseDate ? date < purchaseDate : false
                  }
                  initialFocus
                  locale={es}
                  mode="single"
                  onSelect={(date) => onPaymentDueDateChange(date ?? null)}
                  selected={paymentDueDate ?? undefined}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="remittanceNumber">Número de remito</Label>
            <Input
              disabled={!isEditingDetails}
              id="remittanceNumber"
              onChange={(event) =>
                onRemittanceNumberChange(event.target.value.slice(0, 100))
              }
              placeholder="Opcional"
              value={remittanceNumber ?? ""}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
