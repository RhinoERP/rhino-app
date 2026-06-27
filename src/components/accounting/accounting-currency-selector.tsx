"use client";

import { DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type Moneda = "ARS" | "USD";

export const DEFAULT_TIPO_CAMBIO_USD = 1240;

export function parseAccountingAmount(value: string): number {
  return Number.parseFloat(value.replace(",", ".")) || 0;
}

export function formatAccountingAmount(
  amount: number,
  moneda: Moneda = "ARS"
): string {
  return (
    new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount) + (moneda === "USD" ? " USD" : "")
  );
}

export function convertAccountingAmountToArs(
  amount: number,
  moneda: Moneda,
  tipoCambio: number
): number {
  return moneda === "USD" ? amount * tipoCambio : amount;
}

type AccountingCurrencySelectorProps = {
  moneda: Moneda;
  tipoCambioStr: string;
  onMonedaChange: (moneda: Moneda) => void;
  onTipoCambioChange: (value: string) => void;
};

export function AccountingCurrencySelector({
  moneda,
  tipoCambioStr,
  onMonedaChange,
  onTipoCambioChange,
}: AccountingCurrencySelectorProps) {
  return (
    <div className="rounded-xl border bg-linear-to-r from-muted/60 to-background px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <DollarSign className="size-4" />
          </div>
          <div>
            <p className="font-medium text-sm">Moneda del asiento</p>
            <p className="text-muted-foreground text-xs">
              Los montos se ingresan en la moneda seleccionada.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border bg-background p-1 shadow-xs">
            <Button
              className="h-8 rounded-md px-3"
              onClick={() => onMonedaChange("ARS")}
              size="sm"
              type="button"
              variant={moneda === "ARS" ? "default" : "ghost"}
            >
              ARS
            </Button>
            <Button
              className="h-8 rounded-md px-3"
              onClick={() => onMonedaChange("USD")}
              size="sm"
              type="button"
              variant={moneda === "USD" ? "default" : "ghost"}
            >
              USD
            </Button>
          </div>

          {moneda === "USD" ? (
            <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 shadow-xs">
              <Label className="text-muted-foreground text-xs">1 USD =</Label>
              <Input
                className="h-8 w-28 border-0 bg-transparent px-0 text-right font-mono shadow-none focus-visible:ring-0"
                min={1}
                onChange={(event) => onTipoCambioChange(event.target.value)}
                step={0.01}
                type="number"
                value={tipoCambioStr}
              />
              <span className="text-muted-foreground text-xs">ARS</span>
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-medium text-[11px] text-amber-700">
                Mock
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
