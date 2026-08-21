"use client";

import { PlusCircle, Trash } from "@phosphor-icons/react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { useEffect } from "react";
import type { Control, FieldArrayWithId, UseFormWatch } from "react-hook-form";
import { Controller, useFieldArray, useWatch } from "react-hook-form";
import { VariantStockMatrix } from "@/components/products/variant-stock-matrix";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  ReceiptFormValues,
  ReceivedItemForm,
  VariantProductData,
} from "./purchase-receipt";

type PurchaseReceiptItemsProps = {
  itemFields: FieldArrayWithId<ReceiptFormValues, "items", "id">[];
  control: Control<ReceiptFormValues>;
  watch: UseFormWatch<ReceiptFormValues>;
  onToggleAll: (checked: boolean) => void;
  onProcessSelected: () => void;
  allSelected: boolean;
  selectedCount: number;
  isProcessing: boolean;
  currency?: string;
  variantData: Record<string, VariantProductData>;
  variantStockValues: Record<string, Record<string, Record<string, number>>>;
  onLoadVariantData: (
    productId: string,
    prefilledStocks?: Record<string, Record<string, number>> | null
  ) => void;
  onVariantStockChange: (
    productId: string,
    color: string,
    talle: string,
    value: number
  ) => void;
};

function getUnitLabel(unitOfMeasure?: string | null): string {
  if (!unitOfMeasure) {
    return "un";
  }
  const normalized = unitOfMeasure.toUpperCase();
  switch (normalized) {
    case "KG": {
      return "kg";
    }
    case "LT": {
      return "lt";
    }
    case "MT": {
      return "t";
    }
    default: {
      return "un";
    }
  }
}

function hasWeightOrVolumeMeasure(unitOfMeasure?: string | null): boolean {
  if (!unitOfMeasure) {
    return false;
  }
  const normalized = unitOfMeasure.toUpperCase();
  return normalized === "KG" || normalized === "LT" || normalized === "MT";
}

/** Sub-component that renders the lots section for one item row. */
function ItemLotRows({
  itemIndex,
  item,
  control,
}: {
  itemIndex: number;
  item: ReceivedItemForm;
  control: Control<ReceiptFormValues>;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `items.${itemIndex}.lots`,
  });

  // useWatch on the array level for live totals — this is safe because we are
  // NOT mixing it with setValue on individual paths anymore.
  const lots = useWatch({
    control,
    name: `items.${itemIndex}.lots`,
  });

  const isWeightBased = hasWeightOrVolumeMeasure(item.unit_of_measure);
  const unitLabel = getUnitLabel(item.unit_of_measure);

  const assignedQuantity =
    lots?.reduce((sum, lot) => sum + (Number(lot.quantity) || 0), 0) ?? 0;
  const assignedUnitQuantity =
    lots?.reduce((sum, lot) => sum + (Number(lot.unitQuantity) || 0), 0) ?? 0;

  const pendingUnits = item.orderedQuantity - assignedQuantity;
  const pendingUnitQty = item.orderedUnitQuantity - assignedUnitQuantity;

  const isOverAllocated = isWeightBased
    ? assignedUnitQuantity > item.orderedUnitQuantity + 0.001
    : assignedQuantity > item.orderedQuantity;

  const pendingLabel = isWeightBased
    ? `Pendiente: ${pendingUnitQty.toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} ${unitLabel} · ${pendingUnits} un`
    : `Pendiente: ${pendingUnits} un`;

  const handleAddLot = () => {
    append({
      _key: crypto.randomUUID(),
      lotNumber: "",
      expirationDate: undefined,
      quantity: 0,
      unitQuantity: 0,
    });
  };

  return (
    <div className="space-y-3">
      {/* Pending allocation indicator */}
      <div className="flex items-center justify-between">
        <span className="font-medium text-muted-foreground text-xs">Lotes</span>
        <Badge
          className="text-xs"
          variant={isOverAllocated ? "destructive" : "secondary"}
        >
          {isOverAllocated ? "Excede la cantidad pedida" : pendingLabel}
        </Badge>
      </div>

      {fields.map((field, lotIndex) => (
        <div
          className="space-y-3 rounded-md border border-dashed bg-muted/30 p-3"
          key={field.id}
        >
          <div className="flex items-center justify-between">
            <span className="font-medium text-muted-foreground text-xs">
              Lote #{lotIndex + 1}
            </span>
            {fields.length > 1 && (
              <Button
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={() => remove(lotIndex)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash size={14} />
                <span className="sr-only">Eliminar lote</span>
              </Button>
            )}
          </div>

          <div
            className={cn(
              "grid gap-3",
              isWeightBased ? "sm:grid-cols-2" : "grid-cols-1"
            )}
          >
            {isWeightBased && (
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor={`lot-unitqty-${field.id}`}>
                  Cantidad ({unitLabel})
                </Label>
                <Controller
                  control={control}
                  name={`items.${itemIndex}.lots.${lotIndex}.unitQuantity`}
                  render={({ field: f }) => (
                    <Input
                      className="h-8"
                      id={`lot-unitqty-${field.id}`}
                      min="0"
                      onBlur={f.onBlur}
                      onChange={(e) =>
                        f.onChange(Number.parseFloat(e.target.value) || 0)
                      }
                      placeholder="0.00"
                      step="0.01"
                      type="number"
                      value={f.value || ""}
                    />
                  )}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor={`lot-qty-${field.id}`}>
                Unidades
              </Label>
              <Controller
                control={control}
                name={`items.${itemIndex}.lots.${lotIndex}.quantity`}
                render={({ field: f }) => (
                  <Input
                    className="h-8"
                    id={`lot-qty-${field.id}`}
                    min="0"
                    onBlur={f.onBlur}
                    onChange={(e) =>
                      f.onChange(Number.parseFloat(e.target.value) || 0)
                    }
                    type="number"
                    value={f.value ?? ""}
                  />
                )}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor={`lot-number-${field.id}`}>
                Número de lote
              </Label>
              <Controller
                control={control}
                name={`items.${itemIndex}.lots.${lotIndex}.lotNumber`}
                render={({ field: f }) => (
                  <Input
                    className="h-8"
                    id={`lot-number-${field.id}`}
                    onBlur={f.onBlur}
                    onChange={f.onChange}
                    placeholder="Ej: L-20251201"
                    value={f.value ?? ""}
                  />
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor={`lot-expiry-${field.id}`}>
                Fecha de vencimiento
              </Label>
              <Controller
                control={control}
                name={`items.${itemIndex}.lots.${lotIndex}.expirationDate`}
                render={({ field: f }) => (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        className={cn(
                          "h-8 w-full justify-start text-left font-normal text-xs",
                          !f.value && "text-muted-foreground"
                        )}
                        id={`lot-expiry-${field.id}`}
                        type="button"
                        variant="outline"
                      >
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {f.value ? (
                          format(f.value, "PP", { locale: es })
                        ) : (
                          <span>Seleccionar</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto p-0">
                      <Calendar
                        initialFocus
                        locale={es}
                        mode="single"
                        onSelect={(date) => f.onChange(date)}
                        selected={f.value}
                      />
                    </PopoverContent>
                  </Popover>
                )}
              />
            </div>
          </div>
        </div>
      ))}

      <Button
        className="h-8 w-full border-dashed text-xs"
        onClick={handleAddLot}
        size="sm"
        type="button"
        variant="outline"
      >
        <PlusCircle className="mr-2 h-3.5 w-3.5" />
        Agregar lote
      </Button>
    </div>
  );
}

/** Sub-component that renders the variant matrix for a variant product. */
function ProductVariantMatrixSection({
  orderedQuantity,
  variantData,
  variantStockValues,
  onVariantStockChange,
}: {
  orderedQuantity: number;
  variantData: VariantProductData | undefined;
  variantStockValues: Record<string, Record<string, number>>;
  onVariantStockChange: (color: string, talle: string, value: number) => void;
}) {
  if (!variantData) {
    return (
      <div className="rounded-md border px-3 py-6 text-center text-muted-foreground text-sm">
        Cargando variantes...
      </div>
    );
  }

  const totalReceived = Object.values(variantStockValues).reduce(
    (sum, talles) => sum + Object.values(talles).reduce((s, qty) => s + qty, 0),
    0
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-muted-foreground text-xs">
          Stock por variante
        </span>
        <Badge
          className="text-xs"
          variant={
            totalReceived > orderedQuantity ? "destructive" : "secondary"
          }
        >
          {totalReceived > orderedQuantity
            ? `Excede: ${totalReceived} / ${orderedQuantity} un`
            : `Recibido: ${totalReceived} / ${orderedQuantity} un`}
        </Badge>
      </div>
      <VariantStockMatrix
        colores={variantData.colores}
        editable={true}
        onChange={onVariantStockChange}
        stocks={variantStockValues}
        talles={variantData.talles}
      />
    </div>
  );
}

export function PurchaseReceiptItems({
  itemFields,
  control,
  watch,
  onToggleAll,
  onProcessSelected,
  allSelected,
  selectedCount,
  isProcessing,
  currency = "ARS",
  variantData,
  variantStockValues,
  onLoadVariantData,
  onVariantStockChange,
}: PurchaseReceiptItemsProps) {
  const items = watch("items");

  // Load variant data eagerly for all variant products with prefilled stocks
  useEffect(() => {
    for (const item of items) {
      if (item.has_variants) {
        onLoadVariantData(item.productId, item.variant_stocks);
      }
    }
  }, [items, onLoadVariantData]);

  function getVariantTotal(
    productStocks: Record<string, Record<string, number>>
  ): number {
    return Object.values(productStocks).reduce(
      (sum, talles) => sum + Object.values(talles).reduce((s, q) => s + q, 0),
      0
    );
  }

  function renderItemContent(
    item: ReceivedItemForm,
    idx: number
  ): React.ReactNode {
    if (!item.received) {
      return null;
    }
    if (item.has_variants) {
      return (
        <>
          <Separator />
          <ProductVariantMatrixSection
            onVariantStockChange={(color, talle, value) =>
              onVariantStockChange(item.productId, color, talle, value)
            }
            orderedQuantity={item.orderedQuantity}
            variantData={variantData[item.productId]}
            variantStockValues={variantStockValues[item.productId] ?? {}}
          />
        </>
      );
    }
    return (
      <>
        <Separator />
        <ItemLotRows control={control} item={item} itemIndex={idx} />
      </>
    );
  }

  function renderItemCard(
    field: FieldArrayWithId<ReceiptFormValues, "items", "id">,
    itemIndex: number
  ) {
    const item = items[itemIndex];
    if (!item) {
      return null;
    }

    const isWeightBased = hasWeightOrVolumeMeasure(item.unit_of_measure);
    const unitLabel = getUnitLabel(item.unit_of_measure);
    const lots = item.lots ?? [];
    const unitCost = item.unitCost ?? 0;
    const productDisplay = item.product_name || item.productId;
    const assignedUnitQuantity = lots.reduce(
      (sum, lot) => sum + (lot.unitQuantity ?? 0),
      0
    );
    const totalVariantQty = item.has_variants
      ? getVariantTotal(variantStockValues[item.productId] ?? {})
      : 0;
    const effectiveQty = item.has_variants
      ? totalVariantQty
      : assignedUnitQuantity;
    const subtotal = effectiveQty * unitCost;
    const unitCostStr = `${formatCurrency(item.unitCost, currency)}/${unitLabel}`;
    const orderQtyDetail =
      isWeightBased && item.orderedUnitQuantity > 0
        ? ` · ${item.orderedUnitQuantity.toLocaleString("es-AR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} ${unitLabel}`
        : "";

    return (
      <div
        className="space-y-4 rounded-lg border p-4 hover:bg-muted/50"
        key={field.id}
      >
        {/* Header row: checkbox + product name + summary */}
        <div className="flex items-start gap-3">
          <Controller
            control={control}
            name={`items.${itemIndex}.received`}
            render={({ field: f }) => (
              <Checkbox
                checked={f.value}
                className="mt-1"
                onCheckedChange={(checked) => f.onChange(Boolean(checked))}
              />
            )}
          />
          <div className="flex-1 space-y-1">
            <p className="font-medium">{productDisplay}</p>
            <p className="text-muted-foreground text-sm">
              Pedido: {item.orderedQuantity} unidades
              {orderQtyDetail}
              {" · "}
              {unitCostStr}
              {" · "}
              Subtotal estimado: {formatCurrency(subtotal, currency)}
            </p>
          </div>
        </div>

        {/* Unit cost row */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs" htmlFor={`price-${field.id}`}>
              Precio/{unitLabel} ($)
            </Label>
            <Controller
              control={control}
              name={`items.${itemIndex}.unitCost`}
              render={({ field: f }) => (
                <Input
                  className="h-9"
                  id={`price-${field.id}`}
                  min="0"
                  onBlur={f.onBlur}
                  onChange={(e) =>
                    f.onChange(Number.parseFloat(e.target.value) || 0)
                  }
                  placeholder="0.00"
                  step="0.01"
                  type="number"
                  value={f.value || ""}
                />
              )}
            />
          </div>
        </div>

        {/* Variant matrix or lot rows */}
        {renderItemContent(item, itemIndex)}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-lg">Productos a recibir</CardTitle>
            <CardDescription>
              Marque los productos recibidos, ajuste precio y distribuya la
              cantidad entre los lotes correspondientes
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-md border px-3 py-2">
              <Checkbox
                checked={
                  allSelected ||
                  (selectedCount > 0 && selectedCount < itemFields.length
                    ? "indeterminate"
                    : false)
                }
                id="select-all-items"
                onCheckedChange={(checked) => onToggleAll(Boolean(checked))}
              />
              <Label className="text-xs" htmlFor="select-all-items">
                Seleccionar todos
              </Label>
            </div>
            <Button
              disabled={isProcessing || selectedCount === 0}
              onClick={onProcessSelected}
              size="sm"
              type="button"
            >
              Procesar seleccionados ({selectedCount})
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {itemFields.map((field, itemIndex) => renderItemCard(field, itemIndex))}
      </CardContent>
    </Card>
  );
}
