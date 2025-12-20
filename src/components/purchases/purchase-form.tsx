"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
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

const purchaseFormSchema = z.object({
  supplier_id: z.string().min(1, "Debe seleccionar un proveedor"),
  purchase_date: z.date({
    message: "La fecha de compra es requerida",
  }),
  payment_due_date: z.date().optional(),
});

export type PurchaseFormValues = z.infer<typeof purchaseFormSchema>;

type PurchaseFormProps = {
  suppliers: Supplier[];
  onSupplierChange: (supplierId: string | null) => void;
  selectedSupplierId: string | null;
  onFormChange: (values: Partial<PurchaseFormValues>) => void;
};

export function PurchaseForm({
  suppliers,
  onSupplierChange,
  selectedSupplierId,
  onFormChange,
}: PurchaseFormProps) {
  const [openSupplier, setOpenSupplier] = useState(false);

  const form = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseFormSchema),
    defaultValues: {
      supplier_id: "",
      purchase_date: new Date(),
      payment_due_date: undefined,
    },
  });

  const { watch, setValue, formState } = form;

  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId);

  const handleSupplierChange = (value: string) => {
    setValue("supplier_id", value);
    onSupplierChange(value);
    onFormChange({ supplier_id: value });
    setOpenSupplier(false);
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
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedSupplierId === supplier.id
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
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
            <FieldLabel htmlFor="payment_due_date">
              Fecha de vencimiento
            </FieldLabel>
            <FieldContent>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !watch("payment_due_date") && "text-muted-foreground"
                    )}
                    id="payment_due_date"
                    variant="outline"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {watch("payment_due_date") ? (
                      format(watch("payment_due_date") as Date, "PPP", {
                        locale: es,
                      })
                    ) : (
                      <span>Seleccione una fecha</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-0">
                  <Calendar
                    disabled={(date) =>
                      watch("purchase_date")
                        ? date < watch("purchase_date")
                        : false
                    }
                    initialFocus
                    locale={es}
                    mode="single"
                    onSelect={(date) => {
                      setValue("payment_due_date", date);
                      onFormChange({ payment_due_date: date });
                    }}
                    selected={watch("payment_due_date")}
                  />
                </PopoverContent>
              </Popover>
              <FieldDescription>
                Fecha límite para el pago al proveedor
              </FieldDescription>
            </FieldContent>
          </Field>
        </div>
      </FieldGroup>
    </form>
  );
}
