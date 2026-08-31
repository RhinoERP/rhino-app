"use client";

import { ClipboardTextIcon } from "@phosphor-icons/react";
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
import type { PurchaseDetailItem } from "./purchase-detail-items";

type PurchaseOrderTax = {
  tax_id: string;
  name: string;
  rate: number;
  tax_amount?: number;
};

type PurchaseDetailSummaryProps = {
  items: PurchaseDetailItem[];
  purchaseOrderTaxes?: PurchaseOrderTax[] | null;
  error: string | null;
  currency?: string;
  isDraftSale: boolean;
  isConfirmingDraft: boolean;
  isEditingDetails: boolean;
  isSaving: boolean;
  onConfirmDraft: () => void;
  onSave: () => void;
  globalDiscountPercentage?: number | null;
  globalDiscountAmount?: number | null;
  supplierId?: string;
};

export function PurchaseDetailSummary({
  items,
  purchaseOrderTaxes,
  error,
  currency = "ARS",
  isDraftSale,
  isConfirmingDraft,
  isEditingDetails,
  isSaving,
  onConfirmDraft,
  onSave,
  globalDiscountPercentage,
  globalDiscountAmount,
  supplierId,
}: PurchaseDetailSummaryProps) {
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const totalUnits = items.reduce((sum, item) => sum + item.unit_quantity, 0);
  const totalWeight = items.reduce(
    (sum, item) => sum + (item.total_weight_kg ?? 0),
    0
  );

  const discountPercentage = globalDiscountPercentage ?? 0;
  const discountAmount =
    globalDiscountAmount ??
    Math.min(
      Math.max(0, (discountPercentage / 100) * subtotal),
      Math.max(0, subtotal)
    );

  const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);

  const totalTaxAmount = (purchaseOrderTaxes ?? []).reduce(
    (sum, tax) => sum + (tax.tax_amount ?? 0),
    0
  );

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
                <span className="font-medium">
                  {formatCurrency(subtotal, currency)}
                </span>
              </div>
              {discountAmount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Descuento{" "}
                    {discountPercentage > 0 ? `(${discountPercentage}%)` : ""}
                  </span>
                  <span className="font-medium">
                    -{formatCurrency(discountAmount, currency)}
                  </span>
                </div>
              )}
              {(purchaseOrderTaxes ?? []).map((tax) => (
                <div
                  className="flex items-center justify-between"
                  key={tax.tax_id}
                >
                  <span className="text-muted-foreground">
                    {tax.name} ({tax.rate}%)
                  </span>
                  <span className="font-medium">
                    {formatCurrency(tax.tax_amount ?? 0, currency)}
                  </span>
                </div>
              ))}
              <Separator />
              <div className="flex items-center justify-between font-semibold text-base">
                <span>Total</span>
                <span>{formatCurrency(total, currency)}</span>
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
          {isDraftSale && (
            <CardFooter>
              <Button
                className="w-full justify-between"
                disabled={
                  isConfirmingDraft || !supplierId || items.length === 0
                }
                onClick={onConfirmDraft}
                type="button"
              >
                {isConfirmingDraft ? (
                  "Confirmando..."
                ) : (
                  <>
                    <ClipboardTextIcon
                      className="mr-2 h-4 w-4"
                      weight="duotone"
                    />
                    Confirmar pre-compra
                  </>
                )}
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
