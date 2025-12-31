"use client";

import { FloppyDiskIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/format";
import {
  calculatePurchaseTotals,
  getModifierKey,
} from "@/modules/purchases/utils/purchase-calculations";
import type { Tax } from "@/modules/taxes/service/taxes.service";
import type { PurchaseItem } from "../forms/purchase-items-list";

type PurchaseSummaryProps = {
  items: PurchaseItem[];
  taxes?: Tax[];
  onSubmit?: () => void;
  isSubmitting?: boolean;
  disabled?: boolean;
  globalDiscountPercent?: number;
  onGlobalDiscountChange?: (percent: number) => void;
};

export function PurchaseSummary({
  items,
  taxes = [],
  onSubmit,
  isSubmitting = false,
  disabled = false,
  globalDiscountPercent: globalDiscountPercentProp = 0,
  onGlobalDiscountChange,
}: PurchaseSummaryProps) {
  const [localGlobalDiscount, setLocalGlobalDiscount] = useState<number>(
    globalDiscountPercentProp
  );

  const globalDiscountPercent =
    onGlobalDiscountChange !== undefined
      ? globalDiscountPercentProp
      : localGlobalDiscount;

  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);

  const { taxDetails, discountAmount, total } = calculatePurchaseTotals(
    subtotal,
    taxes,
    globalDiscountPercent
  );

  const handleGlobalDiscountChange = (value: string) => {
    const parsed = Number.parseFloat(value);
    const newValue = Number.isNaN(parsed)
      ? 0
      : Math.min(Math.max(0, parsed), 100);

    if (onGlobalDiscountChange) {
      onGlobalDiscountChange(newValue);
    } else {
      setLocalGlobalDiscount(newValue);
    }
  };

  return (
    <Card className="sticky top-4">
      <CardHeader>
        <CardTitle className="text-lg">Resumen de compra</CardTitle>
        <CardDescription>Totales y detalle de la orden</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">
              Productos ({items.length})
            </span>
            <span className="text-sm">{items.length}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">
              Unidades totales
            </span>
            <span className="text-sm">
              {items.reduce((sum, item) => sum + item.quantity, 0)}
            </span>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">Subtotal</span>
            <span className="font-medium text-sm">
              {formatCurrency(subtotal)}
            </span>
          </div>

          {globalDiscountPercent > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">
                Descuento{" "}
                {globalDiscountPercent ? `(${globalDiscountPercent}%)` : ""}
              </span>
              <span className="font-medium text-sm">
                -{formatCurrency(discountAmount)}
              </span>
            </div>
          )}

          {taxDetails.map(({ tax, amount }) => (
            <div className="flex items-center justify-between" key={tax.id}>
              <span className="text-muted-foreground text-sm">
                {tax.name} ({tax.rate}%)
              </span>
              <span className="font-medium text-sm">
                {formatCurrency(amount)}
              </span>
            </div>
          ))}
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <span className="font-semibold">Total</span>
          <span className="font-bold text-2xl">{formatCurrency(total)}</span>
        </div>

        {items.length === 0 && (
          <p className="text-center text-muted-foreground text-xs">
            Agregue productos para ver el resumen
          </p>
        )}

        {onSubmit && (
          <Button
            className="w-full justify-between"
            disabled={disabled || isSubmitting}
            onClick={onSubmit}
          >
            {isSubmitting ? (
              <>Guardando...</>
            ) : (
              <>
                <div className="flex items-center">
                  <FloppyDiskIcon className="mr-2 h-4 w-4" weight="duotone" />
                  Guardar compra
                </div>
                <KbdGroup>
                  <Kbd>{getModifierKey()}</Kbd>
                  <Kbd>Enter</Kbd>
                </KbdGroup>
              </>
            )}
          </Button>
        )}
      </CardContent>
      <CardFooter className="flex-col gap-4 border-t pt-4">
        <div className="w-full space-y-2">
          <Label className="text-sm" htmlFor="globalDiscount">
            Descuento de la orden
          </Label>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-muted-foreground text-xs">Descuento %</span>
              <Input
                className="h-9 w-28"
                id="globalDiscount"
                inputMode="decimal"
                max={100}
                min={0}
                onChange={(event) =>
                  handleGlobalDiscountChange(event.target.value)
                }
                step="0.01"
                type="number"
                value={
                  Number.isNaN(globalDiscountPercent) ||
                  globalDiscountPercent === 0
                    ? ""
                    : globalDiscountPercent
                }
              />
            </div>
            <div className="text-right">
              <span className="block text-muted-foreground text-xs">
                Descuento aplicado
              </span>
              <span className="font-semibold">
                -{formatCurrency(discountAmount)}
              </span>
            </div>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
