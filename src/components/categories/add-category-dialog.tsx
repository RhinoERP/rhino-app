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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCategories } from "@/modules/categories/hooks/use-categories";
import { useCategoryMutations } from "@/modules/categories/hooks/use-categories-mutations";
import type { Category } from "@/modules/categories/types";

const categorySchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  parent_id: z.string().optional().nullable(),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

type AddCategoryDialogProps = {
  orgSlug: string;
  onCreated?: () => void;
  onUpdated?: () => void;
  category?: Category | null;
  trigger?: ReactNode;
};

const getButtonText = (isSubmitting: boolean, isEditing: boolean): string => {
  if (isSubmitting) {
    return isEditing ? "Actualizando..." : "Guardando...";
  }
  return isEditing ? "Actualizar categoría" : "Guardar categoría";
};

export function AddCategoryDialog({
  orgSlug,
  onCreated,
  onUpdated,
  category,
  trigger,
}: AddCategoryDialogProps) {
  const { createCategory, updateCategory } = useCategoryMutations(orgSlug);
  const { data: categories } = useCategories(orgSlug);
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isEditing = Boolean(category); // Filter out the current category and its descendants to prevent circular references
  const availableParentCategories = useMemo(() => {
    if (!isEditing) {
      return categories;
    }

    // For editing, filter out the category itself and any of its children
    return categories.filter((cat) => {
      if (cat.id === category?.id) {
        return false;
      }
      if (cat.parent_id === category?.id) {
        return false;
      }
      return true;
    });
  }, [categories, category, isEditing]);

  const defaultValues = useMemo(
    () => ({
      name: category?.name || "",
      parent_id: category?.parent_id || null,
    }),
    [category]
  );

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
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
        : `Error desconocido al ${isEditing ? "actualizar" : "crear"} la categoría`;
    setErrorMessage(message);
  };

  const handleUpdate = async (values: CategoryFormValues) => {
    if (!category?.id) {
      throw new Error("ID de categoría no encontrado");
    }

    await updateCategory.mutateAsync({
      categoryId: category.id,
      ...values,
    });
  };

  const handleCreate = async (values: CategoryFormValues) => {
    await createCategory.mutateAsync({
      ...values,
    });
  };

  const onSubmit = async (values: CategoryFormValues) => {
    setErrorMessage(null);

    try {
      if (isEditing) {
        await handleUpdate(values);
      } else {
        await handleCreate(values);
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
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <PlusIcon className="mr-2 h-4 w-4" />
            Nueva Categoría
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Categoría" : "Agregar Nueva Categoría"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Actualiza la información de la categoría."
              : "Completa los datos de la categoría para sumarla a la organización."}
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
                        placeholder="ej. Electrónica, Ropa, etc."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="parent_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoría Padre (Opcional)</FormLabel>
                    <Select
                      onValueChange={(value) =>
                        field.onChange(value === "none" ? null : value)
                      }
                      value={field.value || "none"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sin categoría padre" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">
                          Sin categoría padre
                        </SelectItem>
                        {availableParentCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
