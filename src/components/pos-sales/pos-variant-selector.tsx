"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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
import type { DirectSaleProduct } from "@/modules/sales/types";

const schema = z.object({
  variantId: z.string().min(1, "Selecciona un talle y color"),
  quantity: z.number().int().positive(),
});

type Values = z.infer<typeof schema>;
type Variant = DirectSaleProduct["variants"][number];

export function PosVariantSelector({
  product,
  reservedByVariant,
  onClose,
  onAdd,
}: {
  product: DirectSaleProduct | null;
  reservedByVariant: Record<string, number>;
  onClose: () => void;
  onAdd: (variant: Variant, quantity: number) => void;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { variantId: "", quantity: 1 },
  });

  const variants = product?.variants ?? [];
  const selected = variants.find(
    (variant) => variant.id === watch("variantId")
  );
  const remaining = selected
    ? Math.max(0, selected.stock - (reservedByVariant[selected.id] ?? 0))
    : undefined;

  const close = () => {
    reset({ variantId: "", quantity: 1 });
    onClose();
  };

  const submit = handleSubmit((values) => {
    const variant = variants.find((item) => item.id === values.variantId);
    if (
      !variant ||
      variant.stock - (reservedByVariant[variant.id] ?? 0) < values.quantity
    ) {
      setError("quantity", {
        message: "Stock insuficiente para esta variante",
      });
      return;
    }
    onAdd(variant, values.quantity);
    close();
  });

  return (
    <Dialog onOpenChange={(open) => !open && close()} open={Boolean(product)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Elegir talle y color</DialogTitle>
          <DialogDescription>{product?.name}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label>Variante</Label>
            <Select
              onValueChange={(id) =>
                setValue("variantId", id, { shouldValidate: true })
              }
              value={watch("variantId") || undefined}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleccionar talle y color" />
              </SelectTrigger>
              <SelectContent>
                {variants.map((variant) => (
                  <SelectItem
                    disabled={
                      variant.stock <= (reservedByVariant[variant.id] ?? 0)
                    }
                    key={variant.id}
                    value={variant.id}
                  >
                    {variant.color} / {variant.talle} ·{" "}
                    {Math.max(
                      0,
                      variant.stock - (reservedByVariant[variant.id] ?? 0)
                    )}{" "}
                    disponibles
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.variantId && (
              <p className="text-destructive text-sm">
                {errors.variantId.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="pos-variant-quantity">Unidades</Label>
            <Input
              id="pos-variant-quantity"
              inputMode="numeric"
              max={remaining}
              min={1}
              type="number"
              {...register("quantity", { valueAsNumber: true })}
            />
            {errors.quantity && (
              <p className="text-destructive text-sm">
                {errors.quantity.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={close} type="button" variant="outline">
              Cancelar
            </Button>
            <Button
              disabled={
                !variants.some(
                  (variant) =>
                    variant.stock > (reservedByVariant[variant.id] ?? 0)
                )
              }
              type="submit"
            >
              Agregar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
