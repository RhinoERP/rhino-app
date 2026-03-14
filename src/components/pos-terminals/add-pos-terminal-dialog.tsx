"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { usePosTerminalMutations } from "@/modules/pos/hooks/use-pos-terminal-mutations";
import {
  type PosTerminal,
  type PosTerminalConfigFormValues,
  posTerminalConfigFormSchema,
} from "@/modules/pos/types";

type AddPosTerminalDialogProps = {
  orgSlug: string;
  terminal?: PosTerminal | null;
  onCreated?: () => void;
  onUpdated?: () => void;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const getButtonText = (isSubmitting: boolean, isEditing: boolean): string => {
  if (isSubmitting) {
    return isEditing ? "Actualizando..." : "Guardando...";
  }

  return isEditing ? "Actualizar terminal" : "Guardar terminal";
};

export function AddPosTerminalDialog({
  orgSlug,
  terminal,
  onCreated,
  onUpdated,
  trigger,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
}: AddPosTerminalDialogProps) {
  const { createTerminal } = usePosTerminalMutations(orgSlug);
  const [internalOpen, setInternalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = externalOnOpenChange || setInternalOpen;

  const isEditing = Boolean(terminal);

  const defaultValues = useMemo<PosTerminalConfigFormValues>(
    () => ({
      name: terminal?.name || "",
      code: terminal?.code || null,
      isActive: terminal?.is_active ?? true,
      defaultPriceListId: terminal?.default_price_list_id ?? null,
    }),
    [terminal]
  );

  const form = useForm<PosTerminalConfigFormValues>({
    resolver: zodResolver(posTerminalConfigFormSchema),
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
    reset(defaultValues);
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

  const onSubmit = async (values: PosTerminalConfigFormValues) => {
    setErrorMessage(null);

    try {
      if (isEditing) {
        throw new Error(
          "La edición de terminales aún no está habilitada en esta versión."
        );
      }

      await createTerminal.mutateAsync({
        name: values.name,
        code: values.code,
        isActive: values.isActive,
        defaultPriceListId: values.defaultPriceListId,
      });

      handleSuccess();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la terminal POS"
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
      {!externalOpen && (
        <DialogTrigger asChild>
          {trigger || (
            <Button>
              <PlusIcon className="mr-2 h-4 w-4" />
              Nueva caja POS
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar terminal POS" : "Agregar terminal POS"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Actualiza la configuración de esta caja POS."
              : "Crea una nueva caja/terminal para registrar ventas directas."}
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
                      <Input placeholder="Caja principal" {...field} />
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
                    <FormLabel>Código (opcional)</FormLabel>
                    <FormControl>
                      <Input
                        onChange={(event) =>
                          field.onChange(event.target.value || null)
                        }
                        placeholder="POS-001"
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={field.value}
                        id="is-active"
                        onCheckedChange={(checked) =>
                          field.onChange(Boolean(checked))
                        }
                      />
                      <FormLabel className="mb-0" htmlFor="is-active">
                        Terminal activa
                      </FormLabel>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Las ventas directas usan terminales activas para abrir
                      sesiones de caja.
                    </p>
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
