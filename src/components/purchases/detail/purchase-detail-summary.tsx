"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/format";
import type { Tax } from "@/modules/taxes/service/taxes.service";
import type { PurchaseDetailItem } from "./purchase-detail-items";

type PurchaseDetailSummaryProps = {
  items: PurchaseDetailItem[];
  selectedTaxes: Tax[];
  error: string | null;
  isEditingDetails: boolean;
  isSaving: boolean;
  onSave: () => void;
  globalDiscountPercentage?: number | null;
  globalDiscountAmount?: number | null;
};

export function PurchaseDetailSummary({
  items,
  selectedTaxes,
  error,
  isEditingDetails,
  isSaving,
  onSave,
  globalDiscountPercentage,
  globalDiscountAmount,
}: PurchaseDetailSummaryProps) {
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const totalUnits = items.reduce((sum, item) => sum + item.unit_quantity, 0);
  const totalWeight = items.reduce(
    (sum, item) => sum + (item.total_weight_kg ?? 0),
    0
  );

  // Calculate discount (on subtotal only, not on taxes)
  const discountPercentage = globalDiscountPercentage ?? 0;
  const discountAmount =
    globalDiscountAmount ??
    Math.min(
      Math.max(0, (discountPercentage / 100) * subtotal),
      Math.max(0, subtotal)
    );

  // Subtotal after discount (tax base)
  const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);

  // Calculate taxes on discounted subtotal
  const taxDetails = selectedTaxes.map((tax) => ({
    tax,
    amount: subtotalAfterDiscount * (tax.rate / 100),
  }));

  const totalTaxAmount = taxDetails.reduce(
    (sum, detail) => sum + detail.amount,
    0
  );

  // Total: (subtotal - discount) + taxes
  const total = subtotalAfterDiscount + totalTaxAmount;

  return (
    <div className="w-full lg:w-80 lg:max-w-xs xl:max-w-sm">
      <div className="sticky top-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Resumen de compra</CardTitle>
            <CardDescription>
              Totales y detalle de los productos agregados.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  Productos ({items.length})
                </span>
                <span>{items.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Unidades totales</span>
                <span>{totalUnits}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Peso total</span>
                <span>
                  {totalWeight > 0 ? `${totalWeight.toFixed(2)} kg` : "—"}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Descuento{" "}
                    {discountPercentage > 0 ? `(${discountPercentage}%)` : ""}
                  </span>
                  <span className="font-medium">
                    -{formatCurrency(discountAmount)}
                  </span>
                </div>
              )}
              {taxDetails.map(({ tax, amount }) => (
                <div className="flex items-center justify-between" key={tax.id}>
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

            {error ? (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
                {error}
              </div>
            ) : null}
          </CardContent>
          {isEditingDetails && (
            <CardFooter>
              <Button
                className="w-full"
                disabled={isSaving}
                onClick={onSave}
                type="button"
              >
                {isSaving ? "Guardando..." : "Guardar cambios"}
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
