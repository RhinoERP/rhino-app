"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { useSupplierMutations } from "@/modules/suppliers/hooks/use-suppliers-mutations";
import type { Supplier } from "@/modules/suppliers/service/suppliers.service";

const supplierSchema = z.object({
  name: z.string().min(1, "El nombre del proveedor es obligatorio"),
  cuit: z.string().min(1, "El CUIT es obligatorio"),
  phone: z.string().min(1, "El teléfono es obligatorio"),
  email: z.email("El correo electrónico no es válido"),
  address: z.string().min(1, "La dirección es obligatoria"),
  contact_name: z.string().min(1, "El nombre del contacto es obligatorio"),
  payment_terms: z.string().min(1, "Las condiciones de pago son obligatorias"),
  notes: z.string().optional(),
});

type SupplierFormValues = z.infer<typeof supplierSchema>;

type AddSupplierDialogProps = {
  orgSlug: string;
  supplier?: Supplier | null;
  trigger?: ReactNode;
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
  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: formDefaults,
  });
  const {
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = form;
  const router = useRouter();
  const { createSupplier, updateSupplier } = useSupplierMutations(orgSlug);

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

  const handleSuccess = () => {
    handleClose();

    if (isEditMode) {
      router.refresh();
    }
  };

  const handleError = (error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : `Error desconocido al ${isEditMode ? "actualizar" : "crear"} el proveedor`;
    setErrorMessage(message);
  };

  const handleUpdate = async (values: SupplierFormValues) => {
    if (!supplier?.id) {
      throw new Error("ID de proveedor no encontrado");
    }

    const result = await updateSupplier.mutateAsync({
      ...values,
      supplierId: supplier.id,
    });

    if (!result.success) {
      throw new Error(result.error);
    }
  };

  const handleCreate = async (values: SupplierFormValues) => {
    const result = await createSupplier.mutateAsync({
      ...values,
    });

    if (!result.success) {
      throw new Error(result.error);
    }
  };

  const onSubmit = (values: SupplierFormValues) => {
    setErrorMessage(null);

    try {
      if (isEditMode) {
        handleUpdate(values);
      } else {
        handleCreate(values);
      }
      handleSuccess();
    } catch (error) {
      handleError(error);
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

        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="grid gap-4 py-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input
                        disabled={isSubmitting}
                        placeholder="Proveedor S.A."
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
                          placeholder="12345678901"
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
                          placeholder="+54 11 5555-5555"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          disabled={isSubmitting}
                          placeholder="compras@proveedor.com"
                          type="email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contact_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contacto</FormLabel>
                      <FormControl>
                        <Input
                          disabled={isSubmitting}
                          placeholder="Nombre del contacto"
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
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dirección</FormLabel>
                    <FormControl>
                      <Input
                        disabled={isSubmitting}
                        placeholder="Calle 123, Ciudad"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="payment_terms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Condiciones de pago</FormLabel>
                    <FormControl>
                      <Input
                        disabled={isSubmitting}
                        placeholder="30 días, contado, etc."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas</FormLabel>
                    <FormControl>
                      <Input
                        disabled={isSubmitting}
                        placeholder="Información adicional"
                        {...field}
                      />
                    </FormControl>
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
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
