"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "@phosphor-icons/react";
import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const EMAIL_REGEX = /^[\w.-]+@([\w-]+\.)+[\w-]{2,4}$/;

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

type AddCustomerDialogProps = {
  orgSlug: string;
  onCreated?: () => void;
};

export function AddCustomerDialog({
  orgSlug,
  onCreated,
}: AddCustomerDialogProps) {
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      client_number: "",
      business_name: "",
      fantasy_name: "",
      cuit: "",
      email: "",
      phone: "",
      address: "",
      city: "",
    },
  });

  const resetForm = () => {
    setErrorMessage(null);
    reset();
  };

  const handleClose = () => {
    setOpen(false);
    resetForm();
  };

  const onSubmit = async (values: CustomerFormValues) => {
    setErrorMessage(null);

    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...values,
          orgSlug,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "No se pudo crear el cliente");
      }

      handleClose();
      onCreated?.();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Error desconocido al crear el cliente"
      );
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
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Cliente
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Agregar Nuevo Cliente</DialogTitle>
          <DialogDescription>
            Completa los datos del cliente para sumarlo a la organización.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="client_number">
                Número de Cliente (Opcional)
              </Label>
              <Input
                id="client_number"
                placeholder="CLI-001"
                {...register("client_number")}
                disabled={isSubmitting}
              />
              {errors.client_number && (
                <p className="text-destructive text-sm">
                  {errors.client_number.message}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="business_name">
                Razón Social <span className="text-destructive">*</span>
              </Label>
              <Input
                id="business_name"
                placeholder="Supermercado La Esquina S.R.L."
                {...register("business_name")}
                disabled={isSubmitting}
              />
              {errors.business_name && (
                <p className="text-destructive text-sm">
                  {errors.business_name.message}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="fantasy_name">Nombre Fantasía</Label>
              <Input
                id="fantasy_name"
                placeholder="La Esquina"
                {...register("fantasy_name")}
                disabled={isSubmitting}
              />
              {errors.fantasy_name && (
                <p className="text-destructive text-sm">
                  {errors.fantasy_name.message}
                </p>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
              <div className="grid gap-2">
                <Label htmlFor="cuit">CUIT</Label>
                <Input
                  id="cuit"
                  placeholder="30-71234567-8"
                  {...register("cuit")}
                  disabled={isSubmitting}
                />
                {errors.cuit && (
                  <p className="text-destructive text-sm">
                    {errors.cuit.message}
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input
                  id="phone"
                  placeholder="+54 11 4567-8901"
                  {...register("phone")}
                  disabled={isSubmitting}
                />
                {errors.phone && (
                  <p className="text-destructive text-sm">
                    {errors.phone.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                placeholder="compras@ejemplo.com.ar"
                type="email"
                {...register("email")}
                disabled={isSubmitting}
              />
              {errors.email && (
                <p className="text-destructive text-sm">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
              <div className="grid gap-2">
                <Label htmlFor="address">Dirección</Label>
                <Input
                  id="address"
                  placeholder="Av. Corrientes 1234, CABA"
                  {...register("address")}
                  disabled={isSubmitting}
                />
                {errors.address && (
                  <p className="text-destructive text-sm">
                    {errors.address.message}
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="city">Localidad / Ciudad</Label>
                <Input
                  id="city"
                  placeholder="Ciudad Autónoma de Buenos Aires"
                  {...register("city")}
                  disabled={isSubmitting}
                />
                {errors.city && (
                  <p className="text-destructive text-sm">
                    {errors.city.message}
                  </p>
                )}
              </div>
            </div>

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
              {isSubmitting ? "Guardando..." : "Guardar cliente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
