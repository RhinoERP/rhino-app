"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "@phosphor-icons/react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Product } from "@/modules/inventory/types";

const productSchema = z.object({
  name: z.string().min(1, "El nombre del producto es obligatorio"),
  sku: z.string().min(1, "El SKU es obligatorio"),
  description: z.string().optional(),
  brand: z.string().optional(),
  profit_margin: z
    .number()
    .min(0, "El margen debe ser mayor o igual a 0")
    .optional(),
  category_id: z.string().optional(),
  supplier_id: z.string().optional(),
  unit_of_measure: z.enum(["UN", "KG", "LT", "MT"]),
  units_per_box: z.number().optional(),
  boxes_per_pallet: z.number().optional(),
  image_url: z.string().optional(),
});

type ProductFormValues = z.infer<typeof productSchema>;

type AddProductDialogProps = {
  orgSlug: string;
  onCreated?: () => void;
  onUpdated?: () => void;
  product?: Product | null;
  trigger?: ReactNode;
  categories?: Array<{ id: string; name: string }>;
  suppliers?: Array<{ id: string; name: string }>;
};

const getButtonText = (isSubmitting: boolean, isEditing: boolean): string => {
  if (isSubmitting) {
    return isEditing ? "Actualizando..." : "Guardando...";
  }
  return isEditing ? "Actualizar producto" : "Guardar producto";
};

const createApiUrl = (orgSlug: string, productId?: string): string => {
  const baseUrl = `/api/org/${orgSlug}/products`;
  return productId ? `${baseUrl}/${productId}` : baseUrl;
};

export function AddProductDialog({
  orgSlug,
  onCreated,
  onUpdated,
  product,
  trigger,
  categories = [],
  suppliers = [],
}: AddProductDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isEditing = Boolean(product);

  const defaultValues = useMemo(
    () => ({
      name: product?.name || "",
      sku: product?.sku || "",
      description: product?.description || "",
      brand: product?.brand || "",
      profit_margin:
        (product as unknown as { profit_margin?: number })?.profit_margin ||
        undefined,
      category_id: product?.category_id || "",
      supplier_id: product?.supplier_id || "",
      unit_of_measure: (product?.unit_of_measure ||
        "UN") as ProductFormValues["unit_of_measure"],
      units_per_box: product?.units_per_box || undefined,
      boxes_per_pallet: product?.boxes_per_pallet || undefined,
      image_url: product?.image_url || "",
    }),
    [product]
  );

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues,
  });

  const selectedUnitOfMeasure = watch("unit_of_measure");

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
      } else {
        router.refresh();
      }
    } else if (onCreated) {
      onCreated();
    } else {
      router.refresh();
    }
  };

  const handleError = (error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : `Error desconocido al ${isEditing ? "actualizar" : "crear"} el producto`;
    setErrorMessage(message);
  };

  const onSubmit = async (values: ProductFormValues) => {
    setErrorMessage(null);

    try {
      const url = createApiUrl(orgSlug, product?.id);
      const method = isEditing ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const action = isEditing ? "actualizar" : "crear";
        throw new Error(payload.error || `No se pudo ${action} el producto`);
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
            Nuevo Producto
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Producto" : "Agregar Nuevo Producto"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Actualiza la información del producto."
              : "Completa los datos del producto para agregarlo al inventario."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">
                  Nombre del Producto{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  placeholder="Arroz Largo Fino"
                  {...register("name")}
                  disabled={isSubmitting}
                />
                {errors.name && (
                  <p className="text-destructive text-sm">
                    {errors.name.message}
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="sku">
                  Código SKU <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="sku"
                  placeholder="ARR-001"
                  {...register("sku")}
                  disabled={isSubmitting}
                />
                {errors.sku && (
                  <p className="text-destructive text-sm">
                    {errors.sku.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Descripción</Label>
              <Input
                id="description"
                placeholder="Descripción detallada del producto..."
                {...register("description")}
                disabled={isSubmitting}
              />
              {errors.description && (
                <p className="text-destructive text-sm">
                  {errors.description.message}
                </p>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-3 sm:gap-4">
              <div className="grid gap-2">
                <Label htmlFor="brand">Marca</Label>
                <Input
                  id="brand"
                  placeholder="Ej: Marolio"
                  {...register("brand")}
                  disabled={isSubmitting}
                />
                {errors.brand && (
                  <p className="text-destructive text-sm">
                    {errors.brand.message}
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="category_id">Categoría</Label>
                <Select
                  disabled={isSubmitting}
                  onValueChange={(value) => {
                    setValue("category_id", value === "none" ? "" : value);
                  }}
                  value={watch("category_id") || ""}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin categoría</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="supplier_id">Proveedor</Label>
                <Select
                  disabled={isSubmitting}
                  onValueChange={(value) => {
                    setValue("supplier_id", value === "none" ? "" : value);
                  }}
                  value={watch("supplier_id") || ""}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin proveedor</SelectItem>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
              <div className="grid gap-2">
                <Label htmlFor="profit_margin">Margen de Ganancia (%)</Label>
                <Input
                  id="profit_margin"
                  inputMode="decimal"
                  placeholder="Ej: 25"
                  {...register("profit_margin", {
                    setValueAs: (v) =>
                      v === "" || v === null || v === undefined
                        ? undefined
                        : Number(v),
                  })}
                  disabled={isSubmitting}
                />
                {errors.profit_margin && (
                  <p className="text-destructive text-sm">
                    {errors.profit_margin.message}
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="unit_of_measure">Unidad de Medida</Label>
                <Select
                  disabled={isSubmitting}
                  onValueChange={(value) => {
                    setValue(
                      "unit_of_measure",
                      value as ProductFormValues["unit_of_measure"]
                    );
                  }}
                  value={selectedUnitOfMeasure}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UN">Unidad</SelectItem>
                    <SelectItem value="KG">Kilogramo</SelectItem>
                    <SelectItem value="LT">Litro</SelectItem>
                    <SelectItem value="MT">Metro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
              <div className="grid gap-2">
                <Label htmlFor="units_per_box">Unidades por Caja</Label>
                <Input
                  id="units_per_box"
                  inputMode="numeric"
                  placeholder="Ej: 12"
                  {...register("units_per_box", {
                    setValueAs: (v) =>
                      v === "" || v === null || v === undefined
                        ? undefined
                        : Number(v),
                  })}
                  disabled={isSubmitting}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="boxes_per_pallet">Cajas por Pallet</Label>
                <Input
                  id="boxes_per_pallet"
                  inputMode="numeric"
                  placeholder="Ej: 48"
                  {...register("boxes_per_pallet", {
                    setValueAs: (v) =>
                      v === "" || v === null || v === undefined
                        ? undefined
                        : Number(v),
                  })}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {errorMessage && (
              <div className="rounded-md bg-red-50 p-3 text-red-800 text-sm dark:bg-red-900/20 dark:text-red-400">
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
      </DialogContent>
    </Dialog>
  );
}
