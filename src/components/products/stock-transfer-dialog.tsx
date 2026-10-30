"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowsLeftRightIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
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
import {
  createStockTransferAction,
  getTransferWarehousesAction,
} from "@/modules/inventory/actions/stock-transfer.actions";
import type { ProductVariantRow } from "@/modules/inventory/service/inventory.service";
import type { Product, ProductLotWithStatus } from "@/modules/inventory/types";

const transferFormSchema = z.object({
  sourceLotId: z.uuid("Seleccioná un lote"),
  destinationWarehouseId: z.uuid("Seleccioná un depósito destino"),
  quantity: z
    .string()
    .trim()
    .min(1, "Ingresá la cantidad")
    .refine(
      (value) => Number.parseFloat(value.replace(",", ".")) > 0,
      "La cantidad debe ser mayor a 0"
    ),
  unitQuantity: z.string().trim(),
  reason: z
    .string()
    .trim()
    .max(500, "El motivo no puede superar 500 caracteres"),
});

type TransferFormValues = z.infer<typeof transferFormSchema>;

type StockTransferDialogProps = {
  orgSlug: string;
  product: Product;
  lots: ProductLotWithStatus[];
  variants: ProductVariantRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLotId?: string;
  onTransferred?: () => void;
};

function parseQuantity(value: string): number {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getStockUnitSuffix(unit: string | null): string {
  if (unit === "KG") {
    return " kg";
  }
  if (unit === "LT") {
    return " lt";
  }
  return "";
}

function getQuantityLabel(unit: string | null): string {
  if (unit === "KG") {
    return "Cantidad (kg)";
  }
  if (unit === "LT") {
    return "Cantidad (lt)";
  }
  return "Cantidad";
}

function getLotLabel(
  lot: ProductLotWithStatus,
  variant: ProductVariantRow | undefined,
  warehouseName: string | undefined
): string {
  return [
    lot.lot_number,
    variant ? `${variant.talle} / ${variant.color}` : null,
    warehouseName,
    lot.expiration_date ? lot.expiration_date.slice(0, 10) : "Sin fecha",
  ]
    .filter(Boolean)
    .join(" · ");
}

type TransferField =
  | "sourceLotId"
  | "destinationWarehouseId"
  | "quantity"
  | "unitQuantity";

type TransferValidation =
  | { field: TransferField; message: string }
  | { quantity: number; unitQuantity: number };

function validateTransfer(
  values: TransferFormValues,
  sourceLot: ProductLotWithStatus | undefined,
  tracksUnits: boolean
): TransferValidation {
  if (!sourceLot) {
    return { field: "sourceLotId", message: "Seleccioná un lote" };
  }
  if (values.destinationWarehouseId === sourceLot.warehouse_id) {
    return {
      field: "destinationWarehouseId",
      message: "El depósito destino debe ser distinto del origen",
    };
  }
  const quantity = parseQuantity(values.quantity);
  if (quantity > sourceLot.quantity_available) {
    return {
      field: "quantity",
      message: `Supera el disponible (${sourceLot.quantity_available.toLocaleString("es-AR")})`,
    };
  }
  if (!tracksUnits) {
    return { quantity, unitQuantity: 0 };
  }
  const unitQuantity = parseQuantity(values.unitQuantity);
  if (unitQuantity <= 0) {
    return { field: "unitQuantity", message: "Ingresá la cantidad de piezas" };
  }
  if (unitQuantity > (sourceLot.unit_quantity_available ?? 0)) {
    return {
      field: "unitQuantity",
      message: `Supera las unidades disponibles (${(sourceLot.unit_quantity_available ?? 0).toLocaleString("es-AR")})`,
    };
  }
  return { quantity, unitQuantity };
}

export function StockTransferDialog({
  orgSlug,
  product,
  lots,
  variants,
  open,
  onOpenChange,
  initialLotId,
  onTransferred,
}: StockTransferDialogProps) {
  const isWeightBased =
    product.unit_of_measure === "KG" || product.unit_of_measure === "LT";
  const tracksUnits = isWeightBased && Boolean(product.tracks_stock_units);
  const { data: warehouses = [], isPending: warehousesLoading } = useQuery({
    queryKey: ["inventory-warehouses", orgSlug, "transfer"],
    queryFn: () => getTransferWarehousesAction(orgSlug),
    enabled: open,
    staleTime: 0,
  });
  const availableLots = useMemo(
    () => lots.filter((lot) => lot.quantity_available > 0),
    [lots]
  );
  const warehousesById = useMemo(
    () => new Map(warehouses.map((warehouse) => [warehouse.id, warehouse])),
    [warehouses]
  );
  const variantsById = useMemo(
    () => new Map(variants.map((variant) => [variant.id, variant])),
    [variants]
  );
  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema),
    defaultValues: {
      sourceLotId: "",
      destinationWarehouseId: "",
      quantity: "",
      unitQuantity: "",
      reason: "",
    },
  });
  const sourceLot = availableLots.find(
    (lot) => lot.id === form.watch("sourceLotId")
  );
  const sourceWarehouseName = sourceLot
    ? warehousesById.get(sourceLot.warehouse_id)?.name
    : undefined;
  const destinationOptions = warehouses.filter(
    (warehouse) =>
      warehouse.isActive && warehouse.id !== sourceLot?.warehouse_id
  );
  const pending = form.formState.isSubmitting;
  const stockUnitSuffix = getStockUnitSuffix(product.unit_of_measure);
  const quantityLabel = getQuantityLabel(product.unit_of_measure);

  useEffect(() => {
    if (!open) {
      return;
    }
    const preferredLot =
      availableLots.find((lot) => lot.id === initialLotId) ?? availableLots[0];
    const destination = warehouses.find(
      (warehouse) =>
        warehouse.isActive && warehouse.id !== preferredLot?.warehouse_id
    );
    form.reset({
      sourceLotId: preferredLot?.id ?? "",
      destinationWarehouseId: destination?.id ?? "",
      quantity: "",
      unitQuantity: "",
      reason: "",
    });
  }, [open, initialLotId, availableLots, warehouses, form]);

  const submit = form.handleSubmit(async (values) => {
    const validation = validateTransfer(values, sourceLot, tracksUnits);
    if ("field" in validation) {
      form.setError(validation.field, { message: validation.message });
      return;
    }
    if (!sourceLot) {
      return;
    }
    const result = await createStockTransferAction({
      orgSlug,
      sourceWarehouseId: sourceLot.warehouse_id,
      destinationWarehouseId: values.destinationWarehouseId,
      reason: values.reason || undefined,
      items: [
        {
          sourceLotId: sourceLot.id,
          quantity: validation.quantity,
          unitQuantity: validation.unitQuantity,
        },
      ],
    });
    if (!result.success) {
      form.setError("root", { message: result.error });
      return;
    }
    toast.success("Transferencia registrada");
    onOpenChange(false);
    onTransferred?.();
  });

  const handleOpenChange = (next: boolean) => {
    if (pending) {
      return;
    }
    onOpenChange(next);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Transferir stock</DialogTitle>
          <DialogDescription>
            Mové stock entre depósitos sin cambiar el total de la organización.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={submit}>
            <FormField
              control={form.control}
              name="sourceLotId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lote de origen</FormLabel>
                  <Select
                    disabled={pending || availableLots.length === 0}
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccioná un lote" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableLots.map((lot) => (
                        <SelectItem key={lot.id} value={lot.id}>
                          {getLotLabel(
                            lot,
                            lot.product_variant_id
                              ? variantsById.get(lot.product_variant_id)
                              : undefined,
                            warehousesById.get(lot.warehouse_id)?.name
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {sourceLot && (
                    <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
                      <span>
                        Disponible:{" "}
                        {sourceLot.quantity_available.toLocaleString("es-AR")}
                        {stockUnitSuffix}
                      </span>
                      {tracksUnits && (
                        <Badge variant="outline">
                          {(
                            sourceLot.unit_quantity_available ?? 0
                          ).toLocaleString("es-AR")}{" "}
                          piezas
                        </Badge>
                      )}
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="destinationWarehouseId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Depósito destino</FormLabel>
                  <Select
                    disabled={pending || destinationOptions.length === 0}
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccioná el destino" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {destinationOptions.map((warehouse) => (
                        <SelectItem key={warehouse.id} value={warehouse.id}>
                          {warehouse.name}
                          {warehouse.isDefault ? " · Principal" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Origen: {sourceWarehouseName ?? "sin depósito"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{quantityLabel}</FormLabel>
                    <FormControl>
                      <Input
                        disabled={pending}
                        inputMode="decimal"
                        placeholder="0"
                        step="0.01"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {tracksUnits && (
                <FormField
                  control={form.control}
                  name="unitQuantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Piezas</FormLabel>
                      <FormControl>
                        <Input
                          disabled={pending}
                          inputMode="decimal"
                          placeholder="0"
                          step="1"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      disabled={pending}
                      placeholder="Ej.: reposición de sucursal"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {availableLots.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No hay lotes con stock disponible para transferir.
              </p>
            )}
            {warehousesLoading && (
              <p className="text-muted-foreground text-sm">
                Cargando depósitos...
              </p>
            )}
            {form.formState.errors.root && (
              <p className="text-destructive text-sm" role="alert">
                {form.formState.errors.root.message}
              </p>
            )}

            <DialogFooter>
              <Button
                disabled={pending}
                onClick={() => handleOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button
                disabled={pending || availableLots.length === 0 || !sourceLot}
                type="submit"
              >
                <ArrowsLeftRightIcon className="size-4" />
                {pending ? "Transfiriendo..." : "Transferir"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
