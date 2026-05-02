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
import { useCarrierMutations } from "@/modules/carriers/hooks/use-carriers-mutations";
import type { Carrier } from "@/modules/carriers/service/carriers.service";

const carrierSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  phone: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
});

type CarrierFormValues = z.infer<typeof carrierSchema>;

type CarrierDialogProps = {
  orgSlug: string;
  carrier?: Carrier | null;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCreated?: () => void;
  onUpdated?: () => void;
};

const getButtonText = (isSubmitting: boolean, isEditing: boolean): string => {
  if (isSubmitting) {
    return isEditing ? "Actualizando..." : "Guardando...";
  }
  return isEditing ? "Actualizar transporte" : "Agregar transporte";
};

export function CarrierDialog({
  orgSlug,
  carrier,
  trigger,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
  onCreated,
  onUpdated,
}: CarrierDialogProps) {
  const { createCarrier, updateCarrier } = useCarrierMutations(orgSlug);
  const [internalOpen, setInternalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = externalOnOpenChange ?? setInternalOpen;
  const isEditing = Boolean(carrier);

  const defaultValues = useMemo(
    () => ({
      name: carrier?.name ?? "",
      phone: carrier?.phone ?? "",
      email: carrier?.email ?? "",
    }),
    [carrier]
  );

  const form = useForm<CarrierFormValues>({
    resolver: zodResolver(carrierSchema),
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

  const handleClose = () => {
    setOpen(false);
    setErrorMessage(null);
    reset();
  };

  const onSubmit = async (values: CarrierFormValues) => {
    setErrorMessage(null);
    try {
      const payload = {
        name: values.name.trim(),
        phone: values.phone?.trim() || null,
        email: values.email?.trim() || null,
      };

      if (isEditing && carrier?.id) {
        await updateCarrier.mutateAsync({ carrierId: carrier.id, ...payload });
        onUpdated?.();
      } else {
        await createCarrier.mutateAsync(payload);
        onCreated?.();
      }

      handleClose();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Error al guardar el transporte"
      );
    }
  };

  return (
    <Dialog
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) {
          handleClose();
        }
      }}
      open={open}
    >
      {!externalOpen && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button>
              <PlusIcon className="mr-2 h-4 w-4" />
              Nuevo Transporte
            </Button>
          )}
        </DialogTrigger>
      )}

      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar transporte" : "Agregar transporte"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Actualizá la información del transporte."
              : "Completá los datos del transporte para sumarlo a la organización."}
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
                      <Input placeholder="ej. Transporte Rhinos" {...field} />
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
                    <FormLabel>Teléfono (opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="ej. 11 2233-4455" {...field} />
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
                    <FormLabel>Email (opcional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="ej. transporte@rhinosapp.com"
                        type="email"
                        {...field}
                      />
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
