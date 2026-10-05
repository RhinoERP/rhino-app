"use client";

import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { truncateMoney } from "@/lib/decimal";
import { formatCurrency } from "@/lib/format";
import {
  buildItemizedTaxPlan,
  type ItemTaxInput,
} from "@/modules/taxes/item-tax-calculations";
import type { ReceivedItemForm } from "./purchase-receipt";

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

type PurchaseReceiptSummaryProps = {
  items: ReceivedItemForm[];
  receivedCount: number;
  totalItems: number;
  onReceive: () => void;
  isReceiving: boolean;
  error: string | null;
  currency?: string;
  globalDiscountPercentage?: number | null;
  taxes: Array<{
    tax_id: string | null;
    name: string;
    rate: number;
  }>;
  variantStockValues: Record<string, Record<string, Record<string, number>>>;
  itemTaxSelections: Map<string, ItemTaxInput[]>;
  fallbackTaxes: ItemTaxInput[];
  hasItemTaxSnapshots: boolean;
};

export function PurchaseReceiptSummary({
  items,
  receivedCount,
  totalItems,
  onReceive,
  isReceiving,
  currency = "ARS",
  globalDiscountPercentage = 0,
  taxes,
  variantStockValues,
  itemTaxSelections,
  fallbackTaxes,
  hasItemTaxSnapshots,
}: PurchaseReceiptSummaryProps) {
  // Helper to get total quantity for an item (handles both lots and variants)
  function getItemEffectiveUnitQty(item: ReceivedItemForm): number {
    if (item.has_variants) {
      const productStocks = variantStockValues[item.productId] ?? {};
      return Object.values(productStocks).reduce(
        (sum, talles) => sum + Object.values(talles).reduce((s, q) => s + q, 0),
        0
      );
    }
    return item.lots.reduce((s, lot) => s + (lot.unitQuantity || 0), 0);
  }

  function getItemEffectiveQty(item: ReceivedItemForm): number {
    if (item.has_variants) {
      const productStocks = variantStockValues[item.productId] ?? {};
      return Object.values(productStocks).reduce(
        (sum, talles) => sum + Object.values(talles).reduce((s, q) => s + q, 0),
        0
      );
    }
    return item.lots.reduce((s, lot) => s + (lot.quantity || 0), 0);
  }

  // Calculate subtotal only for received items
  const receivedItems = items.filter((item) => item.received);

  const subtotal = receivedItems.reduce((sum, item) => {
    const effectiveQty = getItemEffectiveUnitQty(item);
    return truncateMoney(
      sum + truncateMoney(effectiveQty * (item.unitCost || 0))
    );
  }, 0);

  const discountAmount = truncateMoney(
    Math.min(
      Math.max(0, ((globalDiscountPercentage ?? 0) / 100) * subtotal),
      Math.max(0, subtotal)
    )
  );
  const subtotalAfterDiscount = truncateMoney(
    Math.max(0, subtotal - discountAmount)
  );

  const taxPlan = hasItemTaxSnapshots
    ? buildItemizedTaxPlan({
        lines: receivedItems.map((item) => ({
          lineId: item.itemId,
          productId: item.productId,
          netAmount: truncateMoney(
            getItemEffectiveUnitQty(item) * (item.unitCost || 0)
          ),
          taxes: itemTaxSelections.get(item.itemId) ?? [],
        })),
        globalDiscountAmount: discountAmount,
        fallbackTaxes,
      })
    : null;
  const taxDetails = taxPlan
    ? taxPlan.aggregateTaxes.map((tax) => ({
        tax: { tax_id: tax.taxId, name: tax.name, rate: tax.rate },
        amount: tax.taxAmount,
      }))
    : taxes.map((tax) => ({
        tax,
        amount: truncateMoney(subtotalAfterDiscount * (tax.rate / 100)),
      }));

  const totalTaxAmount = taxDetails.reduce(
    (sum, detail) => truncateMoney(sum + detail.amount),
    0
  );

  const total = truncateMoney(subtotalAfterDiscount + totalTaxAmount);

  const progress = totalItems > 0 ? (receivedCount / totalItems) * 100 : 0;

  // Get the unit of measure from the first received item (should be consistent)
  const receivedItemsForUnit = items.filter((item) => item.received);
  const primaryUnitOfMeasure =
    receivedItemsForUnit.length > 0
      ? receivedItemsForUnit[0].unit_of_measure
      : null;
  const unitLabel = getUnitLabel(primaryUnitOfMeasure);

  // Aggregated across lots and variant stocks
  const totalUnits = receivedItems.reduce(
    (sum, item) => sum + getItemEffectiveQty(item),
    0
  );
  const totalUnitQuantity = receivedItems.reduce(
    (sum, item) => sum + getItemEffectiveUnitQty(item),
    0
  );

  return (
    <div className="w-full lg:w-80 lg:max-w-xs xl:max-w-sm">
      <div className="sticky top-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Resumen de recepción</CardTitle>
            <CardDescription>Progreso y totales de la compra</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progreso</span>
                <span className="font-medium">
                  {receivedCount} de {totalItems} productos
                </span>
              </div>
              <Progress value={progress} />
            </div>

            <Separator />

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  Productos a recibir
                </span>
                <span>{receivedItems.length}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Unidades totales</span>
                <span>{totalUnits}</span>
              </div>

              {receivedItems.some((item) => item.unit_of_measure) && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Cantidad total ({unitLabel})
                  </span>
                  <span>
                    {totalUnitQuantity.toFixed(2)} {unitLabel}
                  </span>
                </div>
              )}

              <Separator />

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">
                  {formatCurrency(subtotal, currency)}
                </span>
              </div>

              {(globalDiscountPercentage ?? 0) > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Descuento ({globalDiscountPercentage}%)
                  </span>
                  <span className="font-medium">
                    -{formatCurrency(discountAmount, currency)}
                  </span>
                </div>
              )}

              {taxDetails.map(({ tax, amount }) => (
                <div
                  className="flex items-center justify-between"
                  key={tax.tax_id ?? `${tax.name}-${tax.rate}`}
                >
                  <span className="text-muted-foreground">
                    {tax.name} ({tax.rate}%)
                  </span>
                  <span className="font-medium">
                    {formatCurrency(amount, currency)}
                  </span>
                </div>
              ))}

              <Separator />

              <div className="flex items-center justify-between font-semibold text-base">
                <span>Total</span>
                <span>{formatCurrency(total, currency)}</span>
              </div>
            </div>

            <Button
              className="w-full"
              disabled={isReceiving || receivedCount === 0}
              onClick={onReceive}
              size="lg"
            >
              {isReceiving ? (
                "Recibiendo..."
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Marcar como recibido
                </>
              )}
            </Button>

            {receivedCount === 0 && (
              <p className="text-center text-muted-foreground text-xs">
                Marque al menos un producto para recibirlo
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
