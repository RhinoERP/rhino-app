"use client";

import { FloppyDiskIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
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
import { truncateMoney } from "@/lib/decimal";
import { formatCurrency } from "@/lib/format";
import { getModifierKey } from "@/modules/purchases/utils/purchase-calculations";
import {
  buildItemizedTaxPlan,
  type ItemTaxInput,
  type ItemTaxSnapshot,
} from "@/modules/taxes/item-tax-calculations";
import type { PurchaseItem } from "../forms/purchase-items-list";

type TaxSummaryLine = {
  key: string;
  name: string;
  rate: number;
  baseAmount: number;
  taxAmount: number;
};

function summarizeTaxes(itemTaxes: ItemTaxSnapshot[]): TaxSummaryLine[] {
  const byKey = new Map<string, TaxSummaryLine>();
  for (const tax of itemTaxes) {
    const key = [
      tax.taxId ?? "no-tax-id",
      tax.name.trim().toLowerCase(),
      String(tax.rate),
      tax.taxCodeSnapshot ?? "",
    ].join(":");
    const existing = byKey.get(key);
    if (existing) {
      existing.baseAmount = truncateMoney(existing.baseAmount + tax.baseAmount);
      existing.taxAmount = truncateMoney(existing.taxAmount + tax.taxAmount);
      continue;
    }
    byKey.set(key, {
      key,
      name: tax.name,
      rate: tax.rate,
      baseAmount: truncateMoney(tax.baseAmount),
      taxAmount: truncateMoney(tax.taxAmount),
    });
  }
  return Array.from(byKey.values());
}

type PurchaseSummaryProps = {
  items: PurchaseItem[];
  currency?: string;
  onSubmit?: () => void;
  isSubmitting?: boolean;
  disabled?: boolean;
  globalDiscountPercent?: number;
  onGlobalDiscountChange?: (percent: number) => void;
  fallbackTaxes?: ItemTaxInput[];
  productTaxes: Map<string, ItemTaxInput[]>;
};

export function PurchaseSummary({
  items,
  currency = "ARS",
  onSubmit,
  isSubmitting = false,
  disabled = false,
  globalDiscountPercent: globalDiscountPercentProp = 0,
  onGlobalDiscountChange,
  fallbackTaxes = [],
  productTaxes,
}: PurchaseSummaryProps) {
  const [localGlobalDiscount, setLocalGlobalDiscount] = useState<number>(
    globalDiscountPercentProp
  );

  const globalDiscountPercent =
    onGlobalDiscountChange !== undefined
      ? globalDiscountPercentProp
      : localGlobalDiscount;

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.subtotal, 0),
    [items]
  );

  const discountAmount = Math.min(
    Math.max(0, (globalDiscountPercent / 100) * subtotal),
    Math.max(0, subtotal)
  );

  const { totalTaxAmount, generalTaxes, productSummaryTaxes } = useMemo(() => {
    const taxPlan = buildItemizedTaxPlan({
      lines: items.map((item, index) => ({
        lineId: `item-${index}`,
        productId: item.product_id,
        netAmount: item.subtotal,
        taxes: productTaxes.get(item.product_id),
      })),
      globalDiscountAmount: discountAmount,
      fallbackTaxes,
    });
    return {
      totalTaxAmount: taxPlan.totalTaxAmount,
      generalTaxes: summarizeTaxes(
        taxPlan.itemTaxes.filter((tax) => tax.source === "fallback")
      ),
      productSummaryTaxes: summarizeTaxes(
        taxPlan.itemTaxes.filter((tax) => tax.source === "product")
      ),
    };
  }, [items, productTaxes, discountAmount, fallbackTaxes]);

  const total = Math.max(0, subtotal - discountAmount + totalTaxAmount);

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
              {formatCurrency(subtotal, currency)}
            </span>
          </div>

          {globalDiscountPercent > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">
                Descuento{" "}
                {globalDiscountPercent ? `(${globalDiscountPercent}%)` : ""}
              </span>
              <span className="font-medium text-sm">
                -{formatCurrency(discountAmount, currency)}
              </span>
            </div>
          )}

          {generalTaxes.length > 0 && (
            <div className="space-y-2">
              <p className="font-semibold text-muted-foreground text-xs uppercase">
                Impuestos generales de la compra
              </p>
              {generalTaxes.map((tax) => (
                <div
                  className="flex items-center justify-between"
                  key={tax.key}
                >
                  <span className="text-muted-foreground text-xs">
                    {tax.name} ({tax.rate}%)
                  </span>
                  <span className="font-medium text-xs">
                    {formatCurrency(tax.taxAmount, currency)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {productSummaryTaxes.length > 0 && (
            <div className="space-y-2">
              <p className="font-semibold text-muted-foreground text-xs uppercase">
                Impuestos aplicados a productos específicos
              </p>
              {productSummaryTaxes.map((tax) => (
                <div
                  className="flex items-center justify-between"
                  key={tax.key}
                >
                  <span className="text-muted-foreground text-xs">
                    {tax.name} ({tax.rate}%)
                  </span>
                  <span className="font-medium text-xs">
                    {formatCurrency(tax.taxAmount, currency)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {items.length > 0 &&
            generalTaxes.length === 0 &&
            productSummaryTaxes.length === 0 && (
              <p className="text-muted-foreground text-xs italic">
                Ninguno de los productos tiene impuestos asignados.
              </p>
            )}
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <span className="font-semibold">Total</span>
          <span className="font-bold text-2xl">
            {formatCurrency(total, currency)}
          </span>
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
                -{formatCurrency(discountAmount, currency)}
              </span>
            </div>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
