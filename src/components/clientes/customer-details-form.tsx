"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PencilSimple } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type UseFormReturn, useForm } from "react-hook-form";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { Customer } from "@/modules/customers/types";

const EMAIL_REGEX = /^[\w.-]+@([\w-]+\.)+[\w-]{2,4}$/;

type FormFieldProps = {
  id: keyof CustomerFormValues;
  label: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  form: UseFormReturn<CustomerFormValues>;
  isSubmitting: boolean;
};

function FormField({
  id,
  label,
  placeholder,
  type = "text",
  required,
  form,
  isSubmitting,
}: FormFieldProps) {
  const error = form.formState.errors[id];

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required && " *"}
      </Label>
      <Input
        {...form.register(id)}
        disabled={isSubmitting}
        id={id}
        placeholder={placeholder}
        type={type}
      />
      {error && <p className="text-destructive text-sm">{error.message}</p>}
    </div>
  );
}

const customerFormSchema = z.object({
  fantasy_name: z.string().optional(),
  business_name: z.string().min(1, "La razón social es obligatoria"),
  cuit: z.string().optional(),
  client_number: z.string().optional(),
  phone: z.string().optional(),
  email: z
    .string()
    .optional()
    .refine((email) => !email || EMAIL_REGEX.test(email), {
      message: "Formato de email inválido",
    }),
  address: z.string().optional(),
  city: z.string().optional(),
});

type CustomerFormValues = z.infer<typeof customerFormSchema>;

type CustomerDetailsFormProps = {
  customer: Customer;
  orgSlug: string;
};

export function CustomerDetailsForm({
  customer,
  orgSlug,
}: CustomerDetailsFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      fantasy_name: customer.fantasy_name || "",
      business_name: customer.business_name || "",
      cuit: customer.cuit || "",
      client_number: customer.client_number || "",
      phone: customer.phone || "",
      email: customer.email || "",
      address: customer.address || "",
      city: customer.city || "",
    },
  });

  const onSubmit = form.handleSubmit(async (data: CustomerFormValues) => {
    try {
      setIsSubmitting(true);

      const response = await fetch(
        `/api/org/${orgSlug}/customers/${customer.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error updating customer");
      }

      setIsOpen(false);
      router.refresh();
    } catch (error) {
      console.error("Error updating customer:", error);
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <PencilSimple className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Cliente</DialogTitle>
          <DialogDescription>
            Actualiza la información del cliente
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4 py-4" onSubmit={onSubmit}>
          <FormField
            form={form}
            id="fantasy_name"
            isSubmitting={isSubmitting}
            label="Nombre de Fantasía"
            placeholder="Nombre comercial del cliente"
          />

          <FormField
            form={form}
            id="business_name"
            isSubmitting={isSubmitting}
            label="Razón Social"
            placeholder="Razón social oficial"
            required
          />

          <FormField
            form={form}
            id="cuit"
            isSubmitting={isSubmitting}
            label="CUIT"
            placeholder="XX-XXXXXXXX-X"
          />

          <FormField
            form={form}
            id="client_number"
            isSubmitting={isSubmitting}
            label="Número de Cliente"
            placeholder="Código interno del cliente"
          />

          <FormField
            form={form}
            id="phone"
            isSubmitting={isSubmitting}
            label="Teléfono"
            placeholder="+54 11 1234-5678"
            type="tel"
          />

          <FormField
            form={form}
            id="email"
            isSubmitting={isSubmitting}
            label="Email"
            placeholder="cliente@ejemplo.com"
            type="email"
          />

          <FormField
            form={form}
            id="address"
            isSubmitting={isSubmitting}
            label="Dirección"
            placeholder="Calle y número"
          />

          <FormField
            form={form}
            id="city"
            isSubmitting={isSubmitting}
            label="Ciudad"
            placeholder="Ciudad"
          />

          <DialogFooter>
            <Button
              disabled={isSubmitting}
              onClick={() => setIsOpen(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
