"use client";

import { FloppyDiskIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import type { PurchaseItem } from "./purchase-items-list";

type PurchaseSummaryProps = {
  items: PurchaseItem[];
  taxRate?: number;
  onSubmit?: () => void;
  isSubmitting?: boolean;
  disabled?: boolean;
};

const formatCurrency = (amount: number) =>
  amount.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const getModifierKey = (): string => {
  if (typeof window !== "undefined") {
    return navigator.platform.toUpperCase().indexOf("MAC") >= 0 ? "⌘" : "Ctrl";
  }
  return "Ctrl";
};

export function PurchaseSummary({
  items,
  taxRate = 0,
  onSubmit,
  isSubmitting = false,
  disabled = false,
}: PurchaseSummaryProps) {
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

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
              ${formatCurrency(subtotal)}
            </span>
          </div>

          {taxRate > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">
                IVA ({taxRate}%)
              </span>
              <span className="font-medium text-sm">
                ${formatCurrency(taxAmount)}
              </span>
            </div>
          )}
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <span className="font-semibold">Total</span>
          <span className="font-bold text-2xl">${formatCurrency(total)}</span>
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
    </Card>
  );
}
