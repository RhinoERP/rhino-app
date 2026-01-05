"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CalendarIcon,
  CaretUpDownIcon,
  CheckIcon,
  XIcon,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Supplier } from "@/modules/suppliers/service/suppliers.service";
import type { Tax } from "@/modules/taxes/service/taxes.service";

const purchaseFormSchema = z.object({
  supplier_id: z.string().min(1, "Debe seleccionar un proveedor"),
  purchase_date: z.date({
    message: "La fecha de compra es requerida",
  }),
  taxes: z.array(z.string()).optional(),
});

export type PurchaseFormValues = z.infer<typeof purchaseFormSchema>;

type PurchaseFormProps = {
  suppliers: Supplier[];
  taxes: Tax[];
  onSupplierChange: (supplierId: string | null) => void;
  selectedSupplierId: string | null;
  onFormChange: (values: Partial<PurchaseFormValues>) => void;
  selectedTaxIds?: string[];
  onTaxesChange?: (taxIds: string[]) => void;
};

export function PurchaseForm({
  suppliers,
  taxes,
  onSupplierChange,
  selectedSupplierId,
  onFormChange,
  selectedTaxIds = [],
  onTaxesChange,
}: PurchaseFormProps) {
  const [openSupplier, setOpenSupplier] = useState(false);
  const [openTaxes, setOpenTaxes] = useState(false);

  const form = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseFormSchema),
    defaultValues: {
      supplier_id: "",
      purchase_date: new Date(),
      taxes: [],
    },
  });

  const { watch, setValue, formState } = form;

  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId);
  const selectedTaxes = taxes.filter((t) => selectedTaxIds.includes(t.id));

  const handleSupplierChange = (value: string) => {
    setValue("supplier_id", value);
    onSupplierChange(value);
    onFormChange({ supplier_id: value });
    setOpenSupplier(false);
  };

  const handleTaxToggle = (taxId: string) => {
    const newTaxIds = selectedTaxIds.includes(taxId)
      ? selectedTaxIds.filter((id) => id !== taxId)
      : [...selectedTaxIds, taxId];

    setValue("taxes", newTaxIds);
    onTaxesChange?.(newTaxIds);
    onFormChange({ taxes: newTaxIds });
  };

  return (
    <form className="space-y-6">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="supplier_id">
            Proveedor <span className="text-destructive">*</span>
          </FieldLabel>
          <FieldContent>
            <Popover onOpenChange={setOpenSupplier} open={openSupplier}>
              <PopoverTrigger asChild>
                <Button
                  aria-expanded={openSupplier}
                  className="w-full justify-between"
                  id="supplier_id"
                  role="combobox"
                  variant="outline"
                >
                  {selectedSupplier
                    ? `${selectedSupplier.name}${selectedSupplier.cuit ? ` - CUIT: ${selectedSupplier.cuit}` : ""}`
                    : "Seleccione un proveedor"}
                  <CaretUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-(--radix-popover-trigger-width) p-0"
              >
                <Command>
                  <CommandInput placeholder="Buscar proveedor..." />
                  <CommandList>
                    <CommandEmpty>No se encontraron proveedores.</CommandEmpty>
                    <CommandGroup>
                      {suppliers.map((supplier) => (
                        <CommandItem
                          key={supplier.id}
                          onSelect={() => handleSupplierChange(supplier.id)}
                          value={supplier.name}
                        >
                          {selectedSupplierId === supplier.id && (
                            <CheckIcon className="mr-2 h-4 w-4" size={16} />
                          )}
                          <div className="flex flex-col">
                            <span>{supplier.name}</span>
                            {supplier.cuit && (
                              <span className="text-muted-foreground text-xs">
                                CUIT: {supplier.cuit}
                              </span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <FieldDescription>
              Seleccione el proveedor de la compra para cargar sus productos
            </FieldDescription>
            <FieldError errors={[formState.errors.supplier_id]} />
          </FieldContent>
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="purchase_date">
              Fecha de compra <span className="text-destructive">*</span>
            </FieldLabel>
            <FieldContent>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !watch("purchase_date") && "text-muted-foreground"
                    )}
                    id="purchase_date"
                    variant="outline"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {watch("purchase_date") ? (
                      format(watch("purchase_date"), "PPP", { locale: es })
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
                    onSelect={(date) => {
                      setValue("purchase_date", date ?? new Date());
                      onFormChange({ purchase_date: date ?? new Date() });
                    }}
                    selected={watch("purchase_date")}
                  />
                </PopoverContent>
              </Popover>
              <FieldError errors={[formState.errors.purchase_date]} />
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="taxes">Impuestos</FieldLabel>
            <FieldContent>
              <Popover onOpenChange={setOpenTaxes} open={openTaxes}>
                <PopoverTrigger asChild>
                  <Button
                    aria-expanded={openTaxes}
                    className="h-auto min-h-8 w-full justify-between hover:bg-transparent"
                    id="taxes"
                    role="combobox"
                    variant="outline"
                  >
                    <div className="flex flex-wrap items-center gap-1 pr-2.5">
                      {selectedTaxes.length > 0 ? (
                        selectedTaxes.map((tax) => (
                          <Badge
                            className="rounded-sm"
                            key={tax.id}
                            variant="outline"
                          >
                            {tax.name} ({tax.rate}%)
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
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground">
                          Seleccione impuestos (opcional)
                        </span>
                      )}
                    </div>
                    <CaretUpDownIcon
                      aria-hidden="true"
                      className="shrink-0 text-muted-foreground/80"
                    />
                  </Button>
                </PopoverTrigger>
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
              </Popover>
              <FieldDescription>
                Seleccione los impuestos que se aplicarán a esta compra
              </FieldDescription>
            </FieldContent>
          </Field>
        </div>
      </FieldGroup>
    </form>
  );
}
