"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Supplier } from "@/modules/suppliers/service/suppliers.service";

const EMAIL_REGEX = /^[\w.-]+@([\w-]+\.)+[\w-]{2,4}$/;

const supplierSchema = z.object({
  name: z.string().min(1, "El nombre del proveedor es obligatorio"),
  cuit: z.string().optional(),
  phone: z.string().optional(),
  email: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(
      (value) => !value || EMAIL_REGEX.test(value),
      "El email no es válido"
    ),
  address: z.string().optional(),
  contact_name: z.string().optional(),
  payment_terms: z.string().optional(),
  notes: z.string().optional(),
});

type SupplierFormValues = z.infer<typeof supplierSchema>;

type AddSupplierDialogProps = {
  orgSlug: string;
  onCreated?: () => void;
  onUpdated?: () => void;
  supplier?: Supplier | null;
  trigger?: ReactNode;
};

type SubmitConfig = {
  endpoint: string;
  method: "POST" | "PUT";
  fallbackErrorMessage: string;
  unknownErrorMessage: string;
};

const buildSubmitConfig = ({
  isEditMode,
  orgSlug,
  supplierId,
}: {
  isEditMode: boolean;
  orgSlug: string;
  supplierId?: string;
}): SubmitConfig => {
  if (isEditMode && !supplierId) {
    throw new Error("Proveedor inválido para editar");
  }

  const endpoint = isEditMode
    ? `/api/org/${orgSlug}/proveedores/${supplierId}`
    : `/api/org/${orgSlug}/proveedores`;
  const method = isEditMode ? "PUT" : "POST";

  return {
    endpoint,
    method,
    fallbackErrorMessage: isEditMode
      ? "No se pudo actualizar el proveedor"
      : "No se pudo crear el proveedor",
    unknownErrorMessage: isEditMode
      ? "Error desconocido al actualizar el proveedor"
      : "Error desconocido al crear el proveedor",
  };
};

const getSubmitLabel = (isSubmitting: boolean, isEditMode: boolean) => {
  if (isSubmitting) {
    return "Guardando...";
  }

  if (isEditMode) {
    return "Guardar cambios";
  }

  return "Guardar proveedor";
};

export function AddSupplierDialog({
  orgSlug,
  onCreated,
  onUpdated,
  supplier,
  trigger,
}: AddSupplierDialogProps) {
  const isEditMode = Boolean(supplier);
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const formDefaults = useMemo(
    () => ({
      name: supplier?.name ?? "",
      cuit: supplier?.cuit ?? "",
      phone: supplier?.phone ?? "",
      email: supplier?.email ?? "",
      address: supplier?.address ?? "",
      contact_name: supplier?.contact_name ?? "",
      payment_terms: supplier?.payment_terms ?? "",
      notes: supplier?.notes ?? "",
    }),
    [supplier]
  );
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: formDefaults,
  });

  useEffect(() => {
    reset(formDefaults);
  }, [formDefaults, reset]);

  const resetForm = () => {
    setErrorMessage(null);
    reset(formDefaults);
  };

  const handleClose = () => {
    setOpen(false);
    resetForm();
  };

  const onSubmit = async (values: SupplierFormValues) => {
    setErrorMessage(null);

    let submitConfig: SubmitConfig;
    try {
      submitConfig = buildSubmitConfig({
        isEditMode,
        orgSlug,
        supplierId: supplier?.id,
      });
    } catch (configError) {
      setErrorMessage(
        configError instanceof Error
          ? configError.message
          : "Error preparando el envío"
      );
      return;
    }

    try {
      const response = await fetch(submitConfig.endpoint, {
        method: submitConfig.method,
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
        throw new Error(payload.error || submitConfig.fallbackErrorMessage);
      }

      handleClose();
      if (isEditMode) {
        onUpdated?.();
      } else {
        onCreated?.();
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : submitConfig.unknownErrorMessage
      );
    }
  };

  const submitLabel = getSubmitLabel(isSubmitting, isEditMode);

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
        {trigger ?? (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Agregar proveedor
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Editar proveedor" : "Agregar proveedor"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Modifica los datos del proveedor y guarda los cambios."
              : "Completa los datos del proveedor para sumarlo a la organización."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="Proveedor S.A."
                {...register("name")}
                disabled={isSubmitting}
              />
              {errors.name && (
                <p className="text-destructive text-sm">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
              <div className="grid gap-2">
                <Label htmlFor="cuit">CUIT</Label>
                <Input
                  id="cuit"
                  placeholder="12345678901"
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
                  placeholder="+54 11 5555-5555"
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

            <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  placeholder="compras@proveedor.com"
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

              <div className="grid gap-2">
                <Label htmlFor="contact_name">Contacto</Label>
                <Input
                  id="contact_name"
                  placeholder="Nombre del contacto"
                  {...register("contact_name")}
                  disabled={isSubmitting}
                />
                {errors.contact_name && (
                  <p className="text-destructive text-sm">
                    {errors.contact_name.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="address">Dirección</Label>
              <Input
                id="address"
                placeholder="Calle 123, Ciudad"
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
              <Label htmlFor="payment_terms">Condiciones de pago</Label>
              <Input
                id="payment_terms"
                placeholder="30 días, contado, etc."
                {...register("payment_terms")}
                disabled={isSubmitting}
              />
              {errors.payment_terms && (
                <p className="text-destructive text-sm">
                  {errors.payment_terms.message}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notas</Label>
              <Input
                id="notes"
                placeholder="Información adicional"
                {...register("notes")}
                disabled={isSubmitting}
              />
              {errors.notes && (
                <p className="text-destructive text-sm">
                  {errors.notes.message}
                </p>
              )}
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
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
