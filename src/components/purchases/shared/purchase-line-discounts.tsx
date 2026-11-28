"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { truncateMoney } from "@/lib/decimal";
import { formatCurrency } from "@/lib/format";
import {
  calculatePostInvoiceCost,
  HABITUAL_DISCOUNT_FIELDS,
  POST_INVOICE_DISCOUNTS,
  PURCHASE_DISCOUNT_METHOD_LABELS,
  type PurchaseDiscountDetails,
} from "@/modules/purchases/utils/purchase-discounts";

export function PurchaseLineDiscounts({
  item,
  currency,
  editable,
  netAmount,
  taxAmount,
  onChange,
  onListCostChange,
}: {
  item: PurchaseDiscountDetails & {
    unit_cost: number;
    unit_of_measure?: string;
    units_per_box?: number | null;
  };
  currency: string;
  editable: boolean;
  netAmount: number;
  taxAmount: number;
  onChange: (details: PurchaseDiscountDetails) => void;
  onListCostChange: (listUnitCost: number) => void;
}) {
  const factor =
    item.unit_of_measure === "CAJA" ? (item.units_per_box ?? 1) : 1;
  const costs = calculatePostInvoiceCost(netAmount, taxAmount, item);
  return (
    <div className="space-y-3 rounded-md bg-muted/40 p-3 text-sm">
      {item.list_unit_cost != null && (
        <>
          <div className="flex flex-wrap items-end gap-4">
            <Label className="space-y-1">
              Precio de lista{" "}
              {item.unit_of_measure === "CAJA"
                ? "por caja"
                : "por unidad de medida"}
              {editable ? (
                <Input
                  className="h-8 w-36"
                  min={0}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (Number.isFinite(value) && value >= 0) {
                      onListCostChange(value / factor);
                    }
                  }}
                  step="0.01"
                  type="number"
                  value={truncateMoney(item.list_unit_cost * factor)}
                />
              ) : (
                <span className="block">
                  {formatCurrency(item.list_unit_cost * factor, currency)}
                </span>
              )}
            </Label>
            <p>
              Costo neto habitual:{" "}
              <strong>
                {formatCurrency(item.unit_cost * factor, currency)}
              </strong>
            </p>
          </div>
          <p className="text-muted-foreground text-xs">
            Habituales ·{" "}
            {
              PURCHASE_DISCOUNT_METHOD_LABELS[
                item.habitual_discount_method ?? "sequential"
              ]
            }{" "}
            · preimpuestos · método y porcentajes de la lista
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {HABITUAL_DISCOUNT_FIELDS.map((field, index) => (
              <span key={field}>
                Descuento {index + 1}: {item[field] ?? 0}%
              </span>
            ))}
          </div>
        </>
      )}
      <p className="font-medium">Post factura · siempre escalonados</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {POST_INVOICE_DISCOUNTS.map(({ field, label }) => (
          <Label className="space-y-1" key={field}>
            {label} %
            <Input
              aria-label={`${label} %`}
              className="h-8"
              max={100}
              min={0}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isFinite(value) && value >= 0 && value <= 100) {
                  onChange({ [field]: value });
                }
              }}
              readOnly={!editable}
              step="any"
              type="number"
              value={item[field] ?? 0}
            />
          </Label>
        ))}
      </div>
      <p>
        Base{" "}
        {item.post_invoice_discounts_include_taxes
          ? "con impuestos"
          : "sin impuestos"}
        : {formatCurrency(costs.base, currency)} · Costo operativo de la línea:{" "}
        <strong>{formatCurrency(costs.cost, currency)}</strong>
      </p>
      <p className="text-muted-foreground text-xs">
        Los descuentos post factura no reducen el total de la compra, sus
        impuestos ni la deuda con el proveedor.
      </p>
    </div>
  );
}
