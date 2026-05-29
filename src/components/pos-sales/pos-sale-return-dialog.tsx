"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
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
import { Switch } from "@/components/ui/switch";
import { truncateMoney, truncateToDecimals } from "@/lib/decimal";
import { formatCurrency, formatDate } from "@/lib/format";
import type { DirectSale } from "@/modules/sales/types";
import { usePosSaleReturnableItems } from "@/modules/sales-returns/hooks/use-pos-sale-returnable-items";
import { useProcessPosSaleReturnMutation } from "@/modules/sales-returns/hooks/use-process-pos-sale-return-mutation";
import {
  posSaleReturnRefundMethodSchema,
  posSaleReturnResolutionSchema,
} from "@/modules/sales-returns/types";

type PosSaleReturnDialogProps = {
  orgSlug: string;
  sale: DirectSale;
  trigger?: React.ReactNode;
};

const STOCK_EPSILON = 0.000_001;
const QUANTITY_DECIMALS = 6;

const returnItemSchema = z.object({
  posSaleItemId: z.string().trim().min(1),
  quantity: z.number().finite().min(0),
  unitQuantity: z.number().finite().min(0).optional().nullable(),
});

const posSaleReturnFormSchema = z.object({
  reason: z.string().trim().max(500).optional().nullable(),
  restock: z.boolean().default(true),
  resolution: posSaleReturnResolutionSchema.default("credit_note"),
  refundMethod: posSaleReturnRefundMethodSchema.optional().nullable(),
  refundAmount: z.number().finite().min(0).optional().nullable(),
  items: z.array(returnItemSchema),
});

type PosSaleReturnFormInputValues = z.input<typeof posSaleReturnFormSchema>;
type PosSaleReturnFormValues = z.output<typeof posSaleReturnFormSchema>;

const textareaClasses =
  "min-h-[90px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";

const refundMethodOptions = [
  { value: "original_payment", label: "Medio original" },
  { value: "cash", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
  { value: "bank_transfer", label: "Transferencia / cheque" },
  { value: "accounts_receivable", label: "Cuenta corriente" },
] as const;

function normalizeQuantity(value: number): number {
  return truncateToDecimals(value, QUANTITY_DECIMALS);
}

function resolveCustomerName(sale: DirectSale): string {
  if (!sale.customer) {
    return "Consumidor final";
  }

  return sale.customer.fantasy_name || sale.customer.business_name;
}

function resolveLineAmount(params: {
  quantity: number;
  availableToReturn: number;
  maxReturnAmount: number;
}): number {
  const { quantity, availableToReturn, maxReturnAmount } = params;

  if (availableToReturn <= STOCK_EPSILON) {
    return 0;
  }

  const amountPerUnit = maxReturnAmount / availableToReturn;
  const rawAmount = amountPerUnit * quantity;

  return truncateMoney(Math.max(0, Math.min(maxReturnAmount, rawAmount)));
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Component handles hydration, dynamic form arrays, and conditional financial controls.
export function PosSaleReturnDialog({
  orgSlug,
  sale,
  trigger,
}: PosSaleReturnDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [didHydrateFormForOpen, setDidHydrateFormForOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const hasAssociatedCustomer = Boolean(sale.customer_id ?? sale.customer?.id);

  const returnableItemsQuery = usePosSaleReturnableItems(
    orgSlug,
    sale.id,
    open
  );
  const processPosSaleReturn = useProcessPosSaleReturnMutation(
    orgSlug,
    sale.id
  );

  const form = useForm<
    PosSaleReturnFormInputValues,
    undefined,
    PosSaleReturnFormValues
  >({
    resolver: zodResolver(posSaleReturnFormSchema),
    defaultValues: {
      reason: null,
      restock: true,
      resolution: hasAssociatedCustomer ? "credit_note" : "refund",
      refundMethod: "original_payment",
      refundAmount: null,
      items: [],
    },
  });

  const { replace } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchedItems = useWatch({
    control: form.control,
    name: "items",
  });
  const watchedResolution = form.watch("resolution");

  useEffect(() => {
    if (!open) {
      setDidHydrateFormForOpen(false);
      setSubmitError(null);
      return;
    }

    if (!returnableItemsQuery.data || didHydrateFormForOpen) {
      return;
    }

    replace(
      returnableItemsQuery.data.items.map((item) => ({
        posSaleItemId: item.posSaleItemId,
        quantity: 0,
        unitQuantity: null,
      }))
    );

    form.setValue("reason", null);
    form.setValue("restock", true);
    form.setValue(
      "resolution",
      hasAssociatedCustomer ? "credit_note" : "refund"
    );
    form.setValue("refundMethod", "original_payment");
    form.setValue("refundAmount", null);
    setDidHydrateFormForOpen(true);
  }, [
    didHydrateFormForOpen,
    form,
    hasAssociatedCustomer,
    open,
    replace,
    returnableItemsQuery.data,
  ]);

  useEffect(() => {
    if (!hasAssociatedCustomer && watchedResolution === "credit_note") {
      form.setValue("resolution", "refund");
    }
  }, [form, hasAssociatedCustomer, watchedResolution]);

  const returnableItemsById = useMemo(() => {
    const map = new Map<
      string,
      {
        productName: string;
        productSku: string;
        availableToReturn: number;
        soldQuantity: number;
        returnedQuantity: number;
        unitPrice: number;
        maxReturnAmount: number;
      }
    >();

    for (const item of returnableItemsQuery.data?.items ?? []) {
      map.set(item.posSaleItemId, item);
    }

    return map;
  }, [returnableItemsQuery.data?.items]);

  const selectedLines = (watchedItems ?? [])
    .map((line, index) => {
      const fallbackItem = returnableItemsQuery.data?.items[index];
      const posSaleItemId = line.posSaleItemId ?? fallbackItem?.posSaleItemId;

      if (!posSaleItemId) {
        return null;
      }

      const itemData =
        returnableItemsById.get(posSaleItemId) ??
        (fallbackItem && fallbackItem.posSaleItemId === posSaleItemId
          ? fallbackItem
          : undefined);

      if (!itemData) {
        return null;
      }

      const quantity = normalizeQuantity(Number(line.quantity ?? 0));

      if (!(Number.isFinite(quantity) && quantity > STOCK_EPSILON)) {
        return null;
      }

      return {
        posSaleItemId,
        quantity,
        unitQuantity: line.unitQuantity ?? null,
        itemData,
      };
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line));

  const selectedReturnAmount = truncateMoney(
    selectedLines.reduce(
      (sum, line) =>
        sum +
        resolveLineAmount({
          quantity: line.quantity,
          availableToReturn: line.itemData.availableToReturn,
          maxReturnAmount: line.itemData.maxReturnAmount,
        }),
      0
    )
  );

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Submit validates selected lines and financial constraints before dispatching the action.
  const handleSubmit = async (values: PosSaleReturnFormValues) => {
    setSubmitError(null);

    if (!hasAssociatedCustomer && values.resolution === "credit_note") {
      setSubmitError(
        "Esta venta no tiene cliente asociado. Usa resolución Reintegro."
      );
      return;
    }

    if (selectedLines.length === 0) {
      setSubmitError("Selecciona al menos un ítem con cantidad a devolver.");
      return;
    }

    for (const line of selectedLines) {
      if (line.quantity - line.itemData.availableToReturn > STOCK_EPSILON) {
        setSubmitError(
          `La cantidad para ${line.itemData.productName} excede lo disponible (${line.itemData.availableToReturn.toFixed(2)}).`
        );
        return;
      }
    }

    const requestedRefundAmount =
      values.resolution === "refund"
        ? truncateMoney(values.refundAmount ?? selectedReturnAmount)
        : 0;

    if (values.resolution === "refund") {
      if (requestedRefundAmount <= 0) {
        setSubmitError("El monto a reintegrar debe ser mayor a cero.");
        return;
      }

      if (requestedRefundAmount - selectedReturnAmount > STOCK_EPSILON) {
        setSubmitError(
          "El monto a reintegrar no puede superar el total de la devolución."
        );
        return;
      }
    }

    try {
      await processPosSaleReturn.mutateAsync({
        posSaleId: sale.id,
        reason: values.reason ?? null,
        returnDate: new Date().toISOString(),
        restock: values.restock,
        resolution: values.resolution,
        refundMethod:
          values.resolution === "refund"
            ? (values.refundMethod ?? "original_payment")
            : null,
        refundAmount:
          values.resolution === "refund" ? requestedRefundAmount : null,
        items: selectedLines.map((line) => ({
          posSaleItemId: line.posSaleItemId,
          quantity: line.quantity,
          unitQuantity: line.unitQuantity,
          reason: null,
        })),
      });

      toast.success("Devolución procesada correctamente.");
      setOpen(false);
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo procesar la devolución POS.";
      setSubmitError(message);
      toast.error(message);
    }
  };

  const items = returnableItemsQuery.data?.items ?? [];
  const isSubmitting = processPosSaleReturn.isPending;
  const saleTotals = returnableItemsQuery.data?.sale;
  const saleTotalAmount = truncateMoney(
    Number(saleTotals?.totalAmount ?? sale.total_amount ?? 0)
  );
  const totalReturnedAmount = truncateMoney(
    Number(saleTotals?.totalReturnedAmount ?? 0)
  );
  const totalRefundedAmount = truncateMoney(
    Number(saleTotals?.totalRefundedAmount ?? 0)
  );
  const pendingReturnableAmount = truncateMoney(
    Number(
      saleTotals?.pendingReturnableAmount ??
        Math.max(0, saleTotalAmount - totalReturnedAmount)
    )
  );

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <RotateCcw className="mr-2 size-4" />
            Devolver
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Devolución de venta POS</DialogTitle>
          <DialogDescription>
            Venta {sale.receipt_number ?? sale.id} · {resolveCustomerName(sale)}{" "}
            ·{" "}
            {sale.sale_date
              ? formatDate(sale.sale_date, {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })
              : "Sin fecha"}
          </DialogDescription>
        </DialogHeader>

        {returnableItemsQuery.isLoading ? (
          <div className="py-6 text-muted-foreground text-sm">
            Cargando ítems de la venta...
          </div>
        ) : null}

        {returnableItemsQuery.error ? (
          <div className="space-y-3 rounded-md border border-destructive/40 p-3">
            <p className="text-destructive text-sm">
              {returnableItemsQuery.error instanceof Error
                ? returnableItemsQuery.error.message
                : "No se pudieron cargar ítems retornables."}
            </p>
            <Button
              onClick={async () => {
                await returnableItemsQuery.refetch();
              }}
              size="sm"
              variant="outline"
            >
              Reintentar
            </Button>
          </div>
        ) : null}

        {returnableItemsQuery.isLoading || returnableItemsQuery.error ? null : (
          <Form {...form}>
            <form
              className="space-y-4"
              onSubmit={form.handleSubmit(handleSubmit)}
            >
              <div className="grid gap-3 rounded-md border p-3 md:grid-cols-3">
                <div>
                  <p className="text-muted-foreground text-xs">
                    Saldo de venta
                  </p>
                  <p className="font-medium">
                    {formatCurrency(pendingReturnableAmount)}
                  </p>
                  {totalReturnedAmount > 0 ? (
                    <p className="text-muted-foreground text-xs">
                      Devuelto: {formatCurrency(totalReturnedAmount)} ·
                      Reintegrado: {formatCurrency(totalRefundedAmount)}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      Total original: {formatCurrency(saleTotalAmount)}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">
                    Total seleccionado
                  </p>
                  <p className="font-medium">
                    {formatCurrency(selectedReturnAmount)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">
                    Ítems seleccionados
                  </p>
                  <p className="font-medium">{selectedLines.length}</p>
                </div>
              </div>

              <div className="space-y-2 rounded-md border p-3">
                <h4 className="font-medium text-sm">Ítems a devolver</h4>

                {items.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    Esta venta no tiene saldo de ítems disponible para devolver.
                  </p>
                ) : null}

                {items.map((item, index) => (
                  <div
                    className="grid gap-2 rounded-md border p-2 md:grid-cols-[minmax(0,1fr)_220px]"
                    key={item.posSaleItemId}
                  >
                    <div>
                      <p className="font-medium text-sm">{item.productName}</p>
                      <p className="text-muted-foreground text-xs">
                        SKU: {item.productSku || "—"}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Vendido: {item.soldQuantity.toFixed(2)} · Devuelto:{" "}
                        {item.returnedQuantity.toFixed(2)} · Disponible:{" "}
                        {item.availableToReturn.toFixed(2)}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Máximo a devolver:{" "}
                        {formatCurrency(item.maxReturnAmount)}
                      </p>
                    </div>

                    {item.tracksStockUnits ? (
                      <div className="flex gap-2">
                        <FormField
                          control={form.control}
                          name={`items.${index}.quantity`}
                          render={({ field }) => (
                            <FormItem className="flex-1">
                              <FormLabel>
                                Peso (
                                {item.unitOfMeasure?.toLowerCase() ?? "kg"})
                              </FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  max={item.availableToReturn}
                                  min={0}
                                  onChange={(event) => {
                                    const rawValue = Number(event.target.value);
                                    const normalizedValue = Number.isFinite(
                                      rawValue
                                    )
                                      ? normalizeQuantity(rawValue)
                                      : 0;
                                    field.onChange(normalizedValue);
                                  }}
                                  step="0.001"
                                  type="number"
                                  value={field.value ?? ""}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`items.${index}.unitQuantity`}
                          render={({ field }) => (
                            <FormItem className="flex-1">
                              <FormLabel>Unidades</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  min={0}
                                  onChange={(event) => {
                                    const rawValue = event.target.value;
                                    if (rawValue === "" || rawValue === null) {
                                      field.onChange(null);
                                      return;
                                    }
                                    const parsed = Number(rawValue);
                                    field.onChange(
                                      Number.isFinite(parsed)
                                        ? normalizeQuantity(parsed)
                                        : null
                                    );
                                  }}
                                  step="1"
                                  type="number"
                                  value={field.value ?? ""}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    ) : (
                      <FormField
                        control={form.control}
                        name={`items.${index}.quantity`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cantidad a devolver</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                max={item.availableToReturn}
                                min={0}
                                onChange={(event) => {
                                  const rawValue = Number(event.target.value);
                                  const normalizedValue = Number.isFinite(
                                    rawValue
                                  )
                                    ? normalizeQuantity(rawValue)
                                    : 0;
                                  field.onChange(normalizedValue);
                                }}
                                step="0.000001"
                                type="number"
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="resolution"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Resolución</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={
                          field.value ??
                          (hasAssociatedCustomer ? "credit_note" : "refund")
                        }
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona resolución" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem
                            disabled={!hasAssociatedCustomer}
                            value="credit_note"
                          >
                            Nota de crédito
                          </SelectItem>
                          <SelectItem value="refund">Reintegro</SelectItem>
                        </SelectContent>
                      </Select>
                      {hasAssociatedCustomer ? null : (
                        <p className="text-muted-foreground text-xs">
                          Venta sin cliente asociado: solo se permite reintegro.
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="restock"
                  render={({ field }) => (
                    <FormItem className="flex h-full flex-row items-center justify-between rounded-md border px-3 py-2">
                      <div>
                        <FormLabel>Reingresar stock</FormLabel>
                        <p className="text-muted-foreground text-xs">
                          Si está activo, se registran movimientos INBOUND.
                        </p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              {watchedResolution === "refund" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="refundMethod"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Medio de reintegro</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value ?? "original_payment"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona medio" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {refundMethodOptions.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="refundAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Monto a reintegrar</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            max={selectedReturnAmount}
                            min={0}
                            onChange={(event) => {
                              const rawValue = event.target.value;

                              if (rawValue.trim().length === 0) {
                                field.onChange(null);
                                return;
                              }

                              const parsedValue = Number(rawValue);
                              field.onChange(
                                Number.isFinite(parsedValue)
                                  ? truncateMoney(parsedValue)
                                  : null
                              );
                            }}
                            placeholder={selectedReturnAmount.toFixed(2)}
                            step="0.01"
                            type="number"
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ) : null}

              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Motivo (opcional)</FormLabel>
                    <FormControl>
                      <textarea
                        className={textareaClasses}
                        disabled={isSubmitting}
                        onChange={(event) => field.onChange(event.target.value)}
                        placeholder="Ej: Producto con falla, error de facturación, etc."
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {submitError ? (
                <p className="text-destructive text-sm">{submitError}</p>
              ) : null}

              <DialogFooter>
                <Button
                  disabled={isSubmitting}
                  onClick={() => setOpen(false)}
                  type="button"
                  variant="outline"
                >
                  Cancelar
                </Button>
                <Button
                  disabled={isSubmitting || selectedLines.length === 0}
                  type="submit"
                >
                  {isSubmitting ? "Procesando..." : "Procesar devolución"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
