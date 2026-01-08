"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CaretDownIcon, Check, PlusIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useCustomerMutations } from "@/modules/customers/hooks/use-customers-mutations";
import type { Customer } from "@/modules/customers/types";
import { useSalesPriceLists } from "@/modules/sales-price-lists/hooks/use-sales-price-lists";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

const customerSchema = z.object({
  client_number: z.string().optional(),
  business_name: z.string().min(1, "La razón social es obligatoria"),
  fantasy_name: z.string().min(1, "El nombre de fantasía es obligatorio"),
  cuit: z.string().min(1, "El CUIT es obligatorio"),
  email: z.email("El correo electrónico no es válido"),
  phone: z.string().min(1, "El teléfono es obligatorio"),
  address: z.string().min(1, "La dirección es obligatoria"),
  city: z.string().min(1, "La ciudad es obligatoria"),
  sales_price_list_id: z.string().optional(),
});

type CustomerFormValues = z.infer<typeof customerSchema>;

type AddCustomerDialogProps = {
  orgSlug: string;
  onCreated?: () => void;
  onUpdated?: () => void;
  customer?: Customer | null;
  trigger?: ReactNode;
};

const getButtonText = (isSubmitting: boolean, isEditing: boolean): string => {
  if (isSubmitting) {
    return isEditing ? "Actualizando..." : "Guardando...";
  }
  return isEditing ? "Actualizar cliente" : "Guardar cliente";
};

export function AddCustomerDialog({
  orgSlug,
  onCreated,
  onUpdated,
  customer,
  trigger,
}: AddCustomerDialogProps) {
  const { createCustomer, updateCustomer } = useCustomerMutations(orgSlug);
  const { data: salesPriceLists } = useSalesPriceLists(orgSlug);
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPriceListPickerOpen, setIsPriceListPickerOpen] = useState(false);

  const isEditing = Boolean(customer);

  const defaultValues = useMemo(
    () => ({
      client_number: customer?.client_number || "",
      business_name: customer?.business_name || "",
      fantasy_name: customer?.fantasy_name || "",
      cuit: customer?.cuit || "",
      email: customer?.email || "",
      phone: customer?.phone || "",
      address: customer?.address || "",
      city: customer?.city || "",
      sales_price_list_id: customer?.sales_price_list_id || "",
    }),
    [customer]
  );

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues,
  });
  const {
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = form;

  useEffect(() => {
    if (open) {
      reset(defaultValues);
    }
  }, [open, reset, defaultValues]);

  const resetForm = () => {
    setErrorMessage(null);
    reset();
  };

  const handleClose = () => {
    setOpen(false);
    resetForm();
  };

  const handleSuccess = () => {
    handleClose();

    if (isEditing) {
      if (onUpdated) {
        onUpdated();
      }
    } else if (onCreated) {
      onCreated();
    }
  };

  const handleError = (error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : `Error desconocido al ${isEditing ? "actualizar" : "crear"} el cliente`;
    setErrorMessage(message);
  };

  const handleUpdate = async (values: CustomerFormValues) => {
    if (!customer?.id) {
      throw new Error("ID de cliente no encontrado");
    }

    await updateCustomer.mutateAsync({
      customerId: customer.id,
      ...values,
    });
  };

  const handleCreate = async (values: CustomerFormValues) => {
    await createCustomer.mutateAsync({
      ...values,
    });
  };

  const onSubmit = async (values: CustomerFormValues) => {
    setErrorMessage(null);

    try {
      if (isEditing) {
        await handleUpdate(values);
      } else {
        await handleCreate(values);
      }
      handleSuccess();
    } catch (error) {
      handleError(error);
    }
  };

  return (
    <Dialog
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) {
          resetForm();
        }
      }}
      open={open}
    >
      <DialogTrigger asChild>
        {trigger || (
          <Button className="w-full md:w-auto">
            <PlusIcon className="mr-2 h-4 w-4" />
            Nuevo Cliente
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Cliente" : "Agregar Nuevo Cliente"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Actualiza la información del cliente."
              : "Completa los datos del cliente para sumarlo a la organización."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="grid gap-4 py-4">
              <FormField
                control={form.control}
                name="client_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número de Cliente (Opcional)</FormLabel>
                    <FormControl>
                      <Input
                        disabled={isSubmitting}
                        placeholder="CLI-001"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="business_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Razón Social</FormLabel>
                    <FormControl>
                      <Input
                        disabled={isSubmitting}
                        placeholder="Supermercado La Esquina S.R.L."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="fantasy_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre Fantasía</FormLabel>
                    <FormControl>
                      <Input
                        disabled={isSubmitting}
                        placeholder="La Esquina"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
                <FormField
                  control={form.control}
                  name="cuit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CUIT</FormLabel>
                      <FormControl>
                        <Input
                          disabled={isSubmitting}
                          placeholder="30-71234567-8"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Teléfono</FormLabel>
                      <FormControl>
                        <Input
                          disabled={isSubmitting}
                          placeholder="+54 11 4567-8901"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        disabled={isSubmitting}
                        placeholder="compras@ejemplo.com.ar"
                        type="email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dirección</FormLabel>
                      <FormControl>
                        <Input
                          disabled={isSubmitting}
                          placeholder="Av. Corrientes 1234, CABA"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Localidad / Ciudad</FormLabel>
                      <FormControl>
                        <Input
                          disabled={isSubmitting}
                          placeholder="Ciudad Autónoma de Buenos Aires"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="sales_price_list_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lista de Precios de Venta (Opcional)</FormLabel>
                    <Popover
                      onOpenChange={setIsPriceListPickerOpen}
                      open={isPriceListPickerOpen}
                    >
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            aria-expanded={isPriceListPickerOpen}
                            className="w-full justify-between text-left font-normal"
                            disabled={isSubmitting}
                            role="combobox"
                            type="button"
                            variant="outline"
                          >
                            <span className="truncate">
                              {field.value
                                ? salesPriceLists.find(
                                    (list) => list.id === field.value
                                  )?.name || "Selecciona una lista"
                                : "Ninguna (precio base)"}
                            </span>
                            <CaretDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="w-[400px] max-w-[90vw] p-0"
                        sideOffset={8}
                      >
                        <Command>
                          <CommandInput placeholder="Buscar lista de precios..." />
                          <CommandList>
                            <CommandEmpty>Sin resultados.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                onSelect={() => {
                                  field.onChange("");
                                  setIsPriceListPickerOpen(false);
                                }}
                                value="none"
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    field.value ? "opacity-0" : "opacity-100"
                                  )}
                                />
                                Ninguna (precio base)
                              </CommandItem>
                              {salesPriceLists.map((list) => (
                                <CommandItem
                                  key={list.id}
                                  onSelect={() => {
                                    field.onChange(list.id);
                                    setIsPriceListPickerOpen(false);
                                  }}
                                  value={list.name}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      field.value === list.id
                                        ? "opacity-100"
                                        : "opacity-0"
                                    )}
                                  />
                                  <div className="flex flex-col">
                                    <span>{list.name}</span>
                                    <span className="text-muted-foreground text-xs">
                                      {list.percentage > 0 ? "+" : ""}
                                      {list.percentage}%
                                    </span>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <p className="text-muted-foreground text-xs">
                      Lista de precios que se aplicará a todas las ventas de
                      este cliente.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {errorMessage && (
                <div className="rounded-md bg-red-50 p-3 text-red-800 text-sm">
                  {errorMessage}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                disabled={isSubmitting}
                onClick={handleClose}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button disabled={isSubmitting} type="submit">
                {getButtonText(isSubmitting, isEditing)}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
