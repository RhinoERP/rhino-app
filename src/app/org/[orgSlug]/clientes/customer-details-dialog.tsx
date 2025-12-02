"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PencilSimple, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import {
  type FieldErrors,
  type UseFormRegister,
  useForm,
} from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Customer } from "@/modules/customers/types";

const EMAIL_REGEX = /^[\w.-]+@([\w-]+\.)+[\w-]{2,4}$/;

type FormFieldProps = {
  id: keyof CustomerFormValues;
  label: string;
  value?: string | null;
  placeholder?: string;
  type?: string;
  isEditing: boolean;
  isSubmitting: boolean;
  register: UseFormRegister<CustomerFormValues>;
  error?: string;
};

function FormField({
  id,
  label,
  value,
  placeholder,
  type = "text",
  isEditing,
  isSubmitting,
  register,
  error,
}: FormFieldProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {isEditing ? (
        <Input
          id={id}
          placeholder={placeholder}
          type={type}
          {...register(id)}
          disabled={isSubmitting}
        />
      ) : (
        <p className="rounded-md border bg-muted px-3 py-2 text-sm">
          {value || "—"}
        </p>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

type TwoColumnFieldsProps = {
  isEditing: boolean;
  isSubmitting: boolean;
  register: UseFormRegister<CustomerFormValues>;
  errors: FieldErrors<CustomerFormValues>;
  customer: Customer;
};

function TwoColumnFields({
  isEditing,
  isSubmitting,
  register,
  errors,
  customer,
}: TwoColumnFieldsProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
      <FormField
        error={errors.cuit?.message}
        id="cuit"
        isEditing={isEditing}
        isSubmitting={isSubmitting}
        label="CUIT"
        placeholder="30-71234567-8"
        register={register}
        value={customer.cuit}
      />
      <FormField
        error={errors.phone?.message}
        id="phone"
        isEditing={isEditing}
        isSubmitting={isSubmitting}
        label="Teléfono"
        placeholder="+54 11 4567-8901"
        register={register}
        value={customer.phone}
      />
    </div>
  );
}

function AddressCityFields({
  isEditing,
  isSubmitting,
  register,
  errors,
  customer,
}: TwoColumnFieldsProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
      <FormField
        error={errors.address?.message}
        id="address"
        isEditing={isEditing}
        isSubmitting={isSubmitting}
        label="Dirección"
        placeholder="Av. Corrientes 1234, CABA"
        register={register}
        value={customer.address}
      />
      <FormField
        error={errors.city?.message}
        id="city"
        isEditing={isEditing}
        isSubmitting={isSubmitting}
        label="Localidad / Ciudad"
        placeholder="Ciudad Autónoma de Buenos Aires"
        register={register}
        value={customer.city}
      />
    </div>
  );
}

const customerSchema = z.object({
  client_number: z.string().optional(),
  business_name: z.string().min(1, "La razón social es obligatoria"),
  fantasy_name: z.string().optional(),
  cuit: z.string().optional(),
  email: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(
      (value) => !value || EMAIL_REGEX.test(value),
      "El email no es válido"
    ),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
});

type CustomerFormValues = z.infer<typeof customerSchema>;

type CustomerDetailsDialogProps = {
  customer: Customer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
};

export function CustomerDetailsDialog({
  customer,
  open,
  onOpenChange,
  onUpdated,
}: CustomerDetailsDialogProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      client_number: customer.client_number || "",
      business_name: customer.business_name,
      fantasy_name: customer.fantasy_name || "",
      cuit: customer.cuit || "",
      email: customer.email || "",
      phone: customer.phone || "",
      address: customer.address || "",
      city: customer.city || "",
    },
  });

  // Reset form when customer changes or dialog opens
  useEffect(() => {
    if (customer) {
      reset({
        client_number: customer.client_number || "",
        business_name: customer.business_name,
        fantasy_name: customer.fantasy_name || "",
        cuit: customer.cuit || "",
        email: customer.email || "",
        phone: customer.phone || "",
        address: customer.address || "",
        city: customer.city || "",
      });
    }
  }, [customer, reset]);

  const onSubmit = async (values: CustomerFormValues) => {
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/customers/${customer.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "No se pudo actualizar el cliente");
      }

      setIsEditing(false);
      onUpdated?.();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Error desconocido al actualizar el cliente"
      );
    }
  };

  const displayName = customer.fantasy_name || customer.business_name;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>{displayName}</DialogTitle>
              <DialogDescription>
                {isEditing
                  ? "Edita los datos del cliente"
                  : "Detalles del cliente"}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={customer.is_active ? "default" : "secondary"}>
                {customer.is_active ? "Activo" : "Inactivo"}
              </Badge>
              <Button
                onClick={() => setIsEditing(!isEditing)}
                size="sm"
                variant="ghost"
              >
                {isEditing ? (
                  <X className="h-4 w-4" />
                ) : (
                  <PencilSimple className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 py-4">
            <FormField
              error={errors.client_number?.message}
              id="client_number"
              isEditing={isEditing}
              isSubmitting={isSubmitting}
              label="Número de Cliente"
              placeholder="CLI-001"
              register={register}
              value={customer.client_number}
            />

            <FormField
              error={errors.business_name?.message}
              id="business_name"
              isEditing={isEditing}
              isSubmitting={isSubmitting}
              label="Razón Social"
              placeholder="Supermercado La Esquina S.R.L."
              register={register}
              value={customer.business_name}
            />

            <FormField
              error={errors.fantasy_name?.message}
              id="fantasy_name"
              isEditing={isEditing}
              isSubmitting={isSubmitting}
              label="Nombre Fantasía"
              placeholder="La Esquina"
              register={register}
              value={customer.fantasy_name}
            />

            <TwoColumnFields
              customer={customer}
              errors={errors}
              isEditing={isEditing}
              isSubmitting={isSubmitting}
              register={register}
            />

            <FormField
              error={errors.email?.message}
              id="email"
              isEditing={isEditing}
              isSubmitting={isSubmitting}
              label="Email"
              placeholder="compras@ejemplo.com.ar"
              register={register}
              type="email"
              value={customer.email}
            />

            <AddressCityFields
              customer={customer}
              errors={errors}
              isEditing={isEditing}
              isSubmitting={isSubmitting}
              register={register}
            />

            {errorMessage && (
              <div className="rounded-md bg-red-50 p-3 text-red-800 text-sm">
                {errorMessage}
              </div>
            )}
          </div>

          {isEditing && (
            <DialogFooter>
              <Button
                disabled={isSubmitting}
                onClick={() => setIsEditing(false)}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button disabled={isSubmitting} type="submit">
                {isSubmitting ? "Guardando..." : "Guardar cambios"}
              </Button>
            </DialogFooter>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
