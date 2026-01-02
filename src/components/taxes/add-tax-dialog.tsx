"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "@phosphor-icons/react";
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
import { useTaxMutations } from "@/modules/taxes/hooks/use-taxes-mutations";
import type { Tax } from "@/modules/taxes/service/taxes.service";

const taxSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  rate: z
    .string()
    .min(1, "La tasa es obligatoria")
    .refine((value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= 0;
    }, "La tasa debe ser un número válido"),
  code: z.string().optional(),
});

type TaxFormValues = z.infer<typeof taxSchema>;

type AddTaxDialogProps = {
  orgSlug: string;
  onCreated?: () => void;
  onUpdated?: () => void;
  tax?: Tax | null;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const getButtonText = (isSubmitting: boolean, isEditing: boolean): string => {
  if (isSubmitting) {
    return isEditing ? "Actualizando..." : "Guardando...";
  }
  return isEditing ? "Actualizar impuesto" : "Guardar impuesto";
};

export function AddTaxDialog({
  orgSlug,
  onCreated,
  onUpdated,
  tax,
  trigger,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
}: AddTaxDialogProps) {
  const { createTax, updateTax } = useTaxMutations(orgSlug);
  const [internalOpen, setInternalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = externalOnOpenChange || setInternalOpen;

  const isEditing = Boolean(tax);

  const defaultValues = useMemo(
    () => ({
      name: tax?.name || "",
      rate:
        tax?.rate !== null && tax?.rate !== undefined ? String(tax.rate) : "",
      code: tax?.code || "",
    }),
    [tax]
  );

  const form = useForm<TaxFormValues>({
    resolver: zodResolver(taxSchema),
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
      onUpdated?.();
    } else {
      onCreated?.();
    }
  };

  const handleError = (error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : `Error desconocido al ${isEditing ? "actualizar" : "crear"} el impuesto`;
    setErrorMessage(message);
  };

  const onSubmit = async (values: TaxFormValues) => {
    setErrorMessage(null);

    try {
      const payload = {
        name: values.name,
        rate: Number(values.rate),
        code: values.code?.trim() || null,
      };

      if (isEditing) {
        if (!tax?.id) {
          throw new Error("ID de impuesto no encontrado");
        }

        await updateTax.mutateAsync({
          taxId: tax.id,
          ...payload,
        });
      } else {
        await createTax.mutateAsync(payload);
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
      {!externalOpen && (
        <DialogTrigger asChild>
          {trigger || (
            <Button>
              <PlusIcon className="mr-2 h-4 w-4" />
              Nuevo Impuesto
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Impuesto" : "Agregar Nuevo Impuesto"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Actualiza la información del impuesto."
              : "Completa los datos del impuesto para sumarlo a la organización."}
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
                      <Input placeholder="ej. IVA" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tasa (%)</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="decimal"
                        placeholder="ej. 21"
                        type="number"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código (Opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="ej. IVA_21" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {errorMessage && (
                <div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
                  {errorMessage}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                disabled={isSubmitting}
                onClick={() => handleClose()}
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
