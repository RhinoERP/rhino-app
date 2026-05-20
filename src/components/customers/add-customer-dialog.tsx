"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CaretDownIcon,
  Check,
  CircleNotchIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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
import { CUSTOMER_TAX_CONDITION_OPTIONS } from "@/modules/customers/tax-conditions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Separator } from "../ui/separator";

const CUIT_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;
const CUIT_DIGITS_REGEX = /^\d{11}$/;

const normalizeCuitInput = (value: string) => value.replace(/\D/g, "");

const hasValidCuitCheckDigit = (normalizedCuit: string): boolean => {
  if (!CUIT_DIGITS_REGEX.test(normalizedCuit)) {
    return false;
  }

  const digits = normalizedCuit.split("").map(Number);
  const total = CUIT_WEIGHTS.reduce(
    (acc, weight, index) => acc + digits[index] * weight,
    0
  );
  const remainder = total % 11;
  let expectedDigit = 11 - remainder;

  if (remainder === 0) {
    expectedDigit = 0;
  } else if (remainder === 1) {
    expectedDigit = 9;
  }

  return digits[10] === expectedDigit;
};

const customerSchema = z.object({
  customer_channel: z.enum(["DISTRIBUIDORA", "POS", "MIXTO"]),
  client_number: z.string().optional(),
  business_name: z.string().min(1, "La razón social es obligatoria"),
  fantasy_name: z.string().min(1, "El nombre de fantasía es obligatorio"),
  cuit: z
    .string()
    .min(1, "El CUIT es obligatorio")
    .refine(
      (value) => CUIT_DIGITS_REGEX.test(normalizeCuitInput(value)),
      "El CUIT debe tener 11 dígitos"
    )
    .refine(
      (value) => hasValidCuitCheckDigit(normalizeCuitInput(value)),
      "El CUIT no tiene un dígito verificador válido"
    ),
  tax_condition: z.string().min(1, "La condición fiscal es obligatoria"),
  email: z.email("El correo electrónico no es válido"),
  phone: z.string().min(1, "El teléfono es obligatorio"),
  address: z.string().min(1, "La dirección es obligatoria"),
  city: z.string().min(1, "La ciudad es obligatoria"),
  province: z.string().optional(),
  delivery_address: z.string().optional().nullable(),
  delivery_city: z.string().optional().nullable(),
  sales_price_list_id: z.string().optional(),
  assigned_seller_id: z.string().optional(),
  preferred_carrier_id: z.string().optional(),
  due_days: z.number().int().min(1).nullable().optional(),
});

type CustomerFormValues = z.infer<typeof customerSchema>;

type CuitLookupResponse = {
  cuit: string;
  found: boolean;
  businessName: string | null;
  fiscalAddress: string | null;
  city: string | null;
  province: string | null;
  taxCondition: CustomerFormValues["tax_condition"] | null;
};

type CuitLookupState = "idle" | "loading" | "success" | "warning" | "error";

const getCuitValidationMessage = (normalizedCuit: string): string | null => {
  if (!CUIT_DIGITS_REGEX.test(normalizedCuit)) {
    return "El CUIT debe tener 11 dígitos.";
  }

  if (!hasValidCuitCheckDigit(normalizedCuit)) {
    return "El dígito verificador del CUIT no es válido.";
  }

  return null;
};

const isNonBlockingCuitLookupError = (message: string) =>
  message.includes("no tiene autorizado el servicio de padrón ARCA");

async function fetchCuitLookup(
  orgSlug: string,
  normalizedCuit: string
): Promise<CuitLookupResponse> {
  const response = await fetch(
    `/api/org/${orgSlug}/clientes/validate-cuit?cuit=${encodeURIComponent(
      normalizedCuit
    )}`
  );
  const payload = (await response.json().catch(() => ({}))) as
    | CuitLookupResponse
    | { error?: string };

  if (!response.ok) {
    const lookupErrorMessage =
      "error" in payload && payload.error
        ? payload.error
        : "No se pudo validar el CUIT.";
    throw new Error(lookupErrorMessage);
  }

  return payload as CuitLookupResponse;
}

const normalizeCustomerChannel = (
  value?: string | null
): CustomerFormValues["customer_channel"] => {
  const normalized = value?.trim().toUpperCase();
  if (
    normalized === "DISTRIBUIDORA" ||
    normalized === "POS" ||
    normalized === "MIXTO"
  ) {
    return normalized;
  }
  return "DISTRIBUIDORA";
};

type AddCustomerDialogProps = {
  orgSlug: string;
  onCreated?: () => void;
  onUpdated?: () => void;
  customer?: Customer | null;
  trigger?: ReactNode;
};

const EMPTY_CUSTOMER_FORM_VALUES = {
  customer_channel: "DISTRIBUIDORA" as const,
  client_number: "",
  business_name: "",
  fantasy_name: "",
  cuit: "",
  tax_condition: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  province: "",
  delivery_address: null,
  delivery_city: null,
  sales_price_list_id: "",
  assigned_seller_id: "",
  preferred_carrier_id: "",
  due_days: null,
};

const toFormString = (value?: string | null) => value ?? "";

const getDefaultCustomerValues = (customer?: Customer | null) => {
  if (!customer) {
    return EMPTY_CUSTOMER_FORM_VALUES;
  }

  const {
    customer_channel,
    client_number,
    business_name,
    fantasy_name,
    cuit,
    tax_condition,
    email,
    phone,
    address,
    city,
    province,
    delivery_address = null,
    delivery_city = null,
    sales_price_list_id,
    assigned_seller_id,
    preferred_carrier_id,
    due_days = null,
  } = customer;

  return {
    customer_channel: normalizeCustomerChannel(
      customer_channel as string | null | undefined
    ),
    client_number: toFormString(client_number),
    business_name: toFormString(business_name),
    fantasy_name: toFormString(fantasy_name),
    cuit: toFormString(cuit),
    tax_condition: toFormString(tax_condition),
    email: toFormString(email),
    phone: toFormString(phone),
    address: toFormString(address),
    city: toFormString(city),
    province: toFormString(province),
    delivery_address,
    delivery_city,
    sales_price_list_id: toFormString(sales_price_list_id),
    assigned_seller_id: toFormString(assigned_seller_id),
    preferred_carrier_id: toFormString(preferred_carrier_id),
    due_days,
  };
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
  const [cuitLookupState, setCuitLookupState] =
    useState<CuitLookupState>("idle");
  const [cuitLookupMessage, setCuitLookupMessage] = useState<string | null>(
    null
  );
  const [lastAutoLookupCuit, setLastAutoLookupCuit] = useState<string | null>(
    null
  );
  const [sameDeliveryAddress, setSameDeliveryAddress] = useState(
    !(customer?.delivery_address || customer?.delivery_city)
  );

  const isEditing = Boolean(customer);

  const defaultValues = useMemo(
    () => getDefaultCustomerValues(customer),
    [customer]
  );

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues,
  });
  const {
    reset,
    formState: { isSubmitting, dirtyFields },
  } = form;
  const cuitValue = form.watch("cuit");

  useEffect(() => {
    if (open) {
      reset(defaultValues);
      setCuitLookupState("idle");
      setCuitLookupMessage(null);
      setLastAutoLookupCuit(null);
      setSameDeliveryAddress(
        !(customer?.delivery_address || customer?.delivery_city)
      );
    }
  }, [open, reset, defaultValues, customer]);

  const resetForm = () => {
    setErrorMessage(null);
    setCuitLookupState("idle");
    setCuitLookupMessage(null);
    setLastAutoLookupCuit(null);
    reset();
  };

  const applyCuitLookupResult = useCallback(
    (result: CuitLookupResponse) => {
      if (result.businessName) {
        form.setValue("business_name", result.businessName, {
          shouldDirty: true,
          shouldValidate: true,
        });

        if (!form.getValues("fantasy_name")?.trim()) {
          form.setValue("fantasy_name", result.businessName, {
            shouldDirty: true,
            shouldValidate: true,
          });
        }
      }

      if (result.fiscalAddress) {
        form.setValue("address", result.fiscalAddress, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }

      if (result.city) {
        form.setValue("city", result.city, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }

      if (result.province) {
        form.setValue("province", result.province, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }

      if (result.taxCondition) {
        form.setValue("tax_condition", result.taxCondition, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
    },
    [form]
  );

  const handleCuitLookupError = useCallback((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "No se pudo validar el CUIT.";
    setCuitLookupState(
      isNonBlockingCuitLookupError(message) ? "warning" : "error"
    );
    setCuitLookupMessage(message);
  }, []);

  const validateAndAutofillCuit = useCallback(
    async (rawCuit: string, options?: { automatic?: boolean }) => {
      const normalizedCuit = normalizeCuitInput(rawCuit);
      const validationMessage = getCuitValidationMessage(normalizedCuit);

      if (validationMessage) {
        setCuitLookupState("error");
        setCuitLookupMessage(validationMessage);
        return;
      }

      if (options?.automatic) {
        setLastAutoLookupCuit(normalizedCuit);
      }

      setCuitLookupState("loading");
      setCuitLookupMessage("Consultando padrón ARCA...");

      try {
        const result = await fetchCuitLookup(orgSlug, normalizedCuit);

        if (!result.found) {
          setCuitLookupState("error");
          setCuitLookupMessage("CUIT válido, pero no encontrado en ARCA.");
          return;
        }

        applyCuitLookupResult(result);
        setCuitLookupState("success");
        setCuitLookupMessage(
          result.businessName
            ? `Datos encontrados para ${result.businessName}.`
            : "CUIT validado en ARCA."
        );
      } catch (error) {
        handleCuitLookupError(error);
      }
    },
    [applyCuitLookupResult, handleCuitLookupError, orgSlug]
  );

  useEffect(() => {
    if (!(open && cuitValue)) {
      return;
    }

    const normalizedCuit = normalizeCuitInput(cuitValue);

    if (normalizedCuit.length === 0) {
      setCuitLookupState("idle");
      setCuitLookupMessage(null);
      return;
    }

    if (normalizedCuit.length < 11) {
      setCuitLookupState("idle");
      setCuitLookupMessage(
        "Se valida automáticamente al completar 11 dígitos."
      );
      return;
    }

    const validationMessage = getCuitValidationMessage(normalizedCuit);

    if (validationMessage) {
      setCuitLookupState("error");
      setCuitLookupMessage(validationMessage);
      return;
    }

    if (isEditing && !dirtyFields.cuit) {
      return;
    }

    if (lastAutoLookupCuit === normalizedCuit) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      validateAndAutofillCuit(cuitValue, { automatic: true }).catch((error) => {
        console.error("Error validating CUIT:", error);
      });
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [
    open,
    cuitValue,
    isEditing,
    dirtyFields.cuit,
    lastAutoLookupCuit,
    validateAndAutofillCuit,
  ]);

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

  const handleUpdate = async (values: CustomerFormValues): Promise<boolean> => {
    if (!customer?.id) {
      throw new Error("ID de cliente no encontrado");
    }

    const changedFields = Object.keys(
      dirtyFields
    ) as (keyof CustomerFormValues)[];

    if (changedFields.length === 0) {
      toast.info("No hay cambios para guardar");
      return false;
    }

    const isValid = await form.trigger(changedFields);
    if (!isValid) {
      return false;
    }

    const changedValues = Object.fromEntries(
      changedFields.map((field) => [field, values[field]])
    );

    await updateCustomer.mutateAsync({
      customerId: customer.id,
      ...changedValues,
    });

    return true;
  };

  const handleCreate = async (values: CustomerFormValues): Promise<boolean> => {
    const isValid = await form.trigger();
    if (!isValid) {
      return false;
    }

    await createCustomer.mutateAsync(values);
    return true;
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    try {
      const values = form.getValues();

      const isSuccess = isEditing
        ? await handleUpdate(values)
        : await handleCreate(values);

      if (isSuccess) {
        handleSuccess();
      }
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
      <DialogContent className="h-full overflow-y-auto sm:max-w-[560px]">
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
          <form onSubmit={onSubmit}>
            <div className="grid gap-5 py-4">
              <FormField
                control={form.control}
                name="customer_channel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Canal del cliente</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona el canal" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="DISTRIBUIDORA">
                          Distribuidora
                        </SelectItem>
                        <SelectItem value="POS">Venta directa</SelectItem>
                        <SelectItem value="MIXTO">Mixto</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

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

              <div className="grid gap-2">
                <div className="grid items-start gap-2 sm:grid-cols-2 sm:gap-4">
                  <FormField
                    control={form.control}
                    name="cuit"
                    render={({ field }) => (
                      <FormItem className="content-start">
                        <FormLabel>CUIT</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Input
                              disabled={isSubmitting}
                              placeholder="30-71234567-8"
                              {...field}
                            />
                            <Button
                              aria-label="Validar CUIT"
                              disabled={
                                isSubmitting || cuitLookupState === "loading"
                              }
                              onClick={() => {
                                validateAndAutofillCuit(
                                  form.getValues("cuit")
                                ).catch((error) => {
                                  console.error(
                                    "Error validating CUIT:",
                                    error
                                  );
                                });
                              }}
                              size="icon"
                              title="Validar CUIT"
                              type="button"
                              variant="outline"
                            >
                              {cuitLookupState === "loading" ? (
                                <CircleNotchIcon className="h-4 w-4 animate-spin" />
                              ) : (
                                <MagnifyingGlassIcon className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="tax_condition"
                    render={({ field }) => (
                      <FormItem className="content-start">
                        <FormLabel>Condición fiscal</FormLabel>
                        <Select
                          disabled={isSubmitting}
                          onValueChange={field.onChange}
                          value={field.value || undefined}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccioná una condición fiscal" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CUSTOMER_TAX_CONDITION_OPTIONS.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
                  <p
                    className={cn(
                      "text-muted-foreground text-xs",
                      cuitLookupState === "error" && "text-destructive",
                      cuitLookupState === "warning" && "text-amber-600",
                      cuitLookupState === "success" && "text-emerald-700"
                    )}
                  >
                    {cuitLookupMessage ??
                      "Se valida automáticamente al completar 11 dígitos."}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Necesaria para facturación fiscal ARCA.
                  </p>
                </div>
              </div>

              <div className="grid items-start gap-2 sm:grid-cols-2 sm:gap-4">
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
              </div>

              <div className="grid items-start gap-2 sm:grid-cols-2 sm:gap-4">
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
                <FormField
                  control={form.control}
                  name="province"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Provincia</FormLabel>
                      <FormControl>
                        <Input
                          disabled={isSubmitting}
                          placeholder="Buenos Aires"
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
