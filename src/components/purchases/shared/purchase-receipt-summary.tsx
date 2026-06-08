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
import { formatCurrency } from "@/lib/format";
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
  globalDiscountPercentage?: number | null;
  taxes: Array<{
    tax_id: string;
    name: string;
    rate: number;
  }>;
  variantStockValues: Record<string, Record<string, Record<string, number>>>;
};

export function PurchaseReceiptSummary({
  items,
  receivedCount,
  totalItems,
  onReceive,
  isReceiving,
  globalDiscountPercentage = 0,
  taxes,
  variantStockValues,
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
    return sum + effectiveQty * (item.unitCost || 0);
  }, 0);

  const discountAmount = Math.min(
    Math.max(0, ((globalDiscountPercentage ?? 0) / 100) * subtotal),
    Math.max(0, subtotal)
  );
  const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);

  // Calculate taxes on discounted subtotal
  const taxDetails = taxes.map((tax) => ({
    tax,
    amount: subtotalAfterDiscount * (tax.rate / 100),
  }));

  const totalTaxAmount = taxDetails.reduce(
    (sum, detail) => sum + detail.amount,
    0
  );

  const total = subtotalAfterDiscount + totalTaxAmount;

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
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>

              {(globalDiscountPercentage ?? 0) > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Descuento ({globalDiscountPercentage}%)
                  </span>
                  <span className="font-medium">
                    -{formatCurrency(discountAmount)}
                  </span>
                </div>
              )}

              {taxDetails.map(({ tax, amount }) => (
                <div
                  className="flex items-center justify-between"
                  key={tax.tax_id}
                >
                  <span className="text-muted-foreground">
                    {tax.name} ({tax.rate}%)
                  </span>
                  <span className="font-medium">{formatCurrency(amount)}</span>
                </div>
              ))}

              <Separator />

              <div className="flex items-center justify-between font-semibold text-base">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
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
