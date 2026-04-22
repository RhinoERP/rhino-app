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
import { useCarriers } from "@/modules/carriers/hooks/use-carriers";
import { useCustomerMutations } from "@/modules/customers/hooks/use-customers-mutations";
import type { Customer } from "@/modules/customers/types";
import { useOrgSellers } from "@/modules/organizations/hooks/use-org-sellers";
import { useOrgSettings } from "@/modules/organizations/hooks/use-org-settings";
import { useSalesPriceLists } from "@/modules/sales-price-lists/hooks/use-sales-price-lists";
import { Checkbox } from "../ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command";
import { Label } from "../ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Separator } from "../ui/separator";

const customerSchema = z.object({
  client_number: z.string().optional(),
  business_name: z.string().min(1, "La razón social es obligatoria"),
  fantasy_name: z.string().min(1, "El nombre de fantasía es obligatorio"),
  cuit: z.string().min(1, "El CUIT es obligatorio"),
  email: z.email("El correo electrónico no es válido"),
  phone: z.string().min(1, "El teléfono es obligatorio"),
  address: z.string().min(1, "La dirección es obligatoria"),
  city: z.string().min(1, "La ciudad es obligatoria"),
  delivery_address: z.string().optional().nullable(),
  delivery_city: z.string().optional().nullable(),
  sales_price_list_id: z.string().optional(),
  assigned_seller_id: z.string().optional(),
  preferred_carrier_id: z.string().optional(),
  due_days: z.number().int().min(1).nullable().optional(),
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
  const { data: sellers = [] } = useOrgSellers(orgSlug);
  const { data: carriers = [] } = useCarriers(orgSlug);
  const { data: orgSettings } = useOrgSettings(orgSlug);
  const dueDaysEnabled = orgSettings?.due_days_enabled ?? false;
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPriceListPickerOpen, setIsPriceListPickerOpen] = useState(false);
  const [isSellerPickerOpen, setIsSellerPickerOpen] = useState(false);
  const [isCarrierPickerOpen, setIsCarrierPickerOpen] = useState(false);
  const [sameDeliveryAddress, setSameDeliveryAddress] = useState(
    !(customer?.delivery_address || customer?.delivery_city)
  );

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
      delivery_address: customer?.delivery_address ?? null,
      delivery_city: customer?.delivery_city ?? null,
      sales_price_list_id: customer?.sales_price_list_id || "",
      assigned_seller_id: customer?.assigned_seller_id || "",
      preferred_carrier_id: customer?.preferred_carrier_id || "",
      due_days: customer?.due_days ?? null,
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
      setSameDeliveryAddress(
        !(customer?.delivery_address || customer?.delivery_city)
      );
    }
  }, [open, reset, defaultValues, customer]);

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
                      <FormLabel>Dirección cliente</FormLabel>
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
                      <FormLabel>Localidad / Ciudad cliente</FormLabel>
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

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">Dirección de entrega</p>
                  <div className="flex cursor-pointer items-center gap-2 text-muted-foreground text-sm">
                    <Checkbox
                      checked={sameDeliveryAddress}
                      id="same-delivery-address"
                      onCheckedChange={(checked) => {
                        const isChecked = checked === true;
                        setSameDeliveryAddress(isChecked);
                        if (isChecked) {
                          form.setValue("delivery_address", null);
                          form.setValue("delivery_city", null);
                        }
                      }}
                    />
                    <Label
                      className="cursor-pointer font-normal"
                      htmlFor="same-delivery-address"
                    >
                      Misma que dirección cliente
                    </Label>
                  </div>
                </div>

                {!sameDeliveryAddress && (
                  <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
                    <FormField
                      control={form.control}
                      name="delivery_address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Dirección de entrega</FormLabel>
                          <FormControl>
                            <Input
                              disabled={isSubmitting}
                              placeholder="Av. Corrientes 1234, CABA"
                              {...field}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value === "" ? null : e.target.value
                                )
                              }
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="delivery_city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Localidad / Ciudad entrega</FormLabel>
                          <FormControl>
                            <Input
                              disabled={isSubmitting}
                              placeholder="Ciudad Autónoma de Buenos Aires"
                              {...field}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value === "" ? null : e.target.value
                                )
                              }
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
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

              <FormField
                control={form.control}
                name="assigned_seller_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendedor Asignado (Opcional)</FormLabel>
                    <Popover
                      onOpenChange={setIsSellerPickerOpen}
                      open={isSellerPickerOpen}
                    >
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            aria-expanded={isSellerPickerOpen}
                            className="w-full justify-between text-left font-normal"
                            disabled={isSubmitting}
                            role="combobox"
                            type="button"
                            variant="outline"
                          >
                            <span className="truncate">
                              {field.value
                                ? (sellers.find((s) => s.id === field.value)
                                    ?.name ?? "Vendedor no encontrado")
                                : "Sin vendedor asignado"}
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
                          <CommandInput placeholder="Buscar vendedor..." />
                          <CommandList>
                            <CommandEmpty>Sin resultados.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                onSelect={() => {
                                  field.onChange("");
                                  setIsSellerPickerOpen(false);
                                }}
                                value="none"
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    field.value ? "opacity-0" : "opacity-100"
                                  )}
                                />
                                Sin vendedor asignado
                              </CommandItem>
                              {sellers.map((seller) => (
                                <CommandItem
                                  key={seller.id}
                                  keywords={[seller.name, seller.email ?? ""]}
                                  onSelect={() => {
                                    field.onChange(seller.id);
                                    setIsSellerPickerOpen(false);
                                  }}
                                  value={seller.id}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      field.value === seller.id
                                        ? "opacity-100"
                                        : "opacity-0"
                                    )}
                                  />
                                  <div className="flex flex-col">
                                    <span>{seller.name}</span>
                                    {seller.email && (
                                      <span className="text-muted-foreground text-xs">
                                        {seller.email}
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              {carriers.length > 0 && (
                <FormField
                  control={form.control}
                  name="preferred_carrier_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Transporte Preferido (Opcional)</FormLabel>
                      <Popover
                        onOpenChange={setIsCarrierPickerOpen}
                        open={isCarrierPickerOpen}
                      >
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              aria-expanded={isCarrierPickerOpen}
                              className="w-full justify-between text-left font-normal"
                              disabled={isSubmitting}
                              role="combobox"
                              type="button"
                              variant="outline"
                            >
                              <span className="truncate">
                                {field.value
                                  ? (carriers.find((c) => c.id === field.value)
                                      ?.name ?? "Transporte no encontrado")
                                  : "Sin transporte preferido"}
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
                            <CommandInput placeholder="Buscar transporte..." />
                            <CommandList>
                              <CommandEmpty>Sin resultados.</CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                  onSelect={() => {
                                    field.onChange("");
                                    setIsCarrierPickerOpen(false);
                                  }}
                                  value="none"
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      field.value ? "opacity-0" : "opacity-100"
                                    )}
                                  />
                                  Sin transporte preferido
                                </CommandItem>
                                {carriers.map((carrier) => (
                                  <CommandItem
                                    key={carrier.id}
                                    onSelect={() => {
                                      field.onChange(carrier.id);
                                      setIsCarrierPickerOpen(false);
                                    }}
                                    value={carrier.name}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        field.value === carrier.id
                                          ? "opacity-100"
                                          : "opacity-0"
                                      )}
                                    />
                                    {carrier.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {dueDaysEnabled && (
                <FormField
                  control={form.control}
                  name="due_days"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Días de vencimiento (Opcional)</FormLabel>
                      <FormControl>
                        <Input
                          className="w-32"
                          disabled={isSubmitting}
                          min={1}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === ""
                                ? null
                                : Number(e.target.value)
                            )
                          }
                          placeholder="30"
                          type="number"
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <p className="text-muted-foreground text-xs">
                        Días hasta el vencimiento para las ventas de este
                        cliente. Si lo dejás vacío, se usa el valor por defecto
                        de la organización.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

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
