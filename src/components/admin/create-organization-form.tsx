"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
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
import { createOrganizationAction } from "@/modules/admin/actions/create-organization.action";
import type { Organization } from "@/modules/organizations/service/organizations.service";

const createOrganizationSchema = z.object({
  orgName: z
    .string()
    .min(1, "El nombre de la organización es requerido")
    .min(3, "El nombre debe tener al menos 3 caracteres"),
  adminEmail: z
    .string()
    .min(1, "El email del administrador es requerido")
    .email("El email no es válido"),
  cuit: z
    .string()
    .min(1, "El CUIT es requerido")
    .regex(/^\d{11}$/, "El CUIT debe tener 11 dígitos numéricos"),
});

type CreateOrganizationFormData = z.infer<typeof createOrganizationSchema>;

type CreateOrganizationFormProps = {
  onOrganizationCreated?: (organization: Organization) => void;
};

export function CreateOrganizationForm({
  onOrganizationCreated,
}: CreateOrganizationFormProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CreateOrganizationFormData>({
    resolver: zodResolver(createOrganizationSchema),
  });

  const onSubmit = async (data: CreateOrganizationFormData) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await createOrganizationAction(
        data.orgName,
        data.adminEmail,
        data.cuit
      );

      if (result.success) {
        setSuccessMessage(
          "Organización creada exitosamente. El enlace de acceso ha sido enviado al email del administrador."
        );
        reset();
        if (result.organization) {
          onOrganizationCreated?.(result.organization);
        }
        setTimeout(() => {
          setOpen(false);
          setSuccessMessage(null);
        }, 2000);
      } else {
        setErrorMessage(result.error || "Error al crear la organización");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Error desconocido al crear la organización"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Crear Organización
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Crear Nueva Organización</DialogTitle>
          <DialogDescription>
            Crea una nueva organización con un administrador. Se generará un
            slug único basado en el nombre y se enviará un enlace de acceso al
            email del administrador.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="orgName">
                Nombre de la Organización{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="orgName"
                placeholder="Ej: Mi Empresa S.A."
                {...register("orgName")}
                disabled={isSubmitting}
              />
              {errors.orgName && (
                <p className="text-destructive text-sm">
                  {errors.orgName.message}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="adminEmail">
                Email del Administrador{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="adminEmail"
                placeholder="admin@ejemplo.com"
                type="email"
                {...register("adminEmail")}
                disabled={isSubmitting}
              />
              {errors.adminEmail && (
                <p className="text-destructive text-sm">
                  {errors.adminEmail.message}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="cuit">
                CUIT <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cuit"
                maxLength={11}
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

            {successMessage && (
              <div className="rounded-md bg-green-50 p-3 text-green-800 text-sm">
                {successMessage}
              </div>
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
              onClick={() => {
                setOpen(false);
                reset();
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? "Creando..." : "Crear Organización"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
