"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
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
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReceivedItem } from "./purchase-receipt";

type PurchaseReceiptItemsProps = {
  items: ReceivedItem[];
  onItemChange: (itemId: string, updates: Partial<ReceivedItem>) => void;
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

export function PurchaseReceiptItems({
  items,
  onItemChange,
}: PurchaseReceiptItemsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Productos a recibir</CardTitle>
        <CardDescription>
          Marque los productos recibidos y ajuste cantidades, pesos y precios si
          es necesario
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {items.map((item) => (
          <div
            className="space-y-4 rounded-lg border p-4 hover:bg-muted/50"
            key={item.itemId}
          >
            <div className="flex items-start gap-3">
              <Checkbox
                checked={item.received}
                className="mt-1"
                onCheckedChange={(checked) =>
                  onItemChange(item.itemId, { received: Boolean(checked) })
                }
              />
              <div className="flex-1 space-y-3">
                <div>
                  <p className="font-medium">
                    {item.product_name || item.productId}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    Pedido: {item.unitQuantity} unidades
                    {item.quantity > 0
                      ? ` · ${item.quantity.toLocaleString("es-AR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })} ${getUnitLabel(item.unit_of_measure)}`
                      : ""}
                    {" · "}
                    {formatCurrency(item.unitCost)}/$
                    {getUnitLabel(item.unit_of_measure)}
                    {" · "}
                    Subtotal: {formatCurrency(item.subtotal)}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label className="text-xs" htmlFor={`units-${item.itemId}`}>
                      Unidades
                    </Label>
                    <Input
                      className="h-9"
                      id={`units-${item.itemId}`}
                      min="0"
                      onChange={(e) =>
                        onItemChange(item.itemId, {
                          unitQuantity: Number.parseFloat(e.target.value) || 0,
                        })
                      }
                      type="number"
                      value={item.unitQuantity || ""}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      className="text-xs"
                      htmlFor={`weight-${item.itemId}`}
                    >
                      Cantidad ({getUnitLabel(item.unit_of_measure)})
                    </Label>
                    <Input
                      className="h-9"
                      id={`weight-${item.itemId}`}
                      min="0"
                      onChange={(e) =>
                        onItemChange(item.itemId, {
                          quantity: Number.parseFloat(e.target.value) || 0,
                        })
                      }
                      placeholder="0.00"
                      step="0.01"
                      type="number"
                      value={item.quantity || ""}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs" htmlFor={`price-${item.itemId}`}>
                      Precio/{getUnitLabel(item.unit_of_measure)} ($)
                    </Label>
                    <Input
                      className="h-9"
                      id={`price-${item.itemId}`}
                      min="0"
                      onChange={(e) =>
                        onItemChange(item.itemId, {
                          unitCost: Number.parseFloat(e.target.value) || 0,
                        })
                      }
                      placeholder="0.00"
                      step="0.01"
                      type="number"
                      value={item.unitCost || ""}
                    />
                  </div>
                </div>

                {item.received && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label
                        className="text-xs"
                        htmlFor={`expiration-${item.itemId}`}
                      >
                        Fecha de vencimiento
                      </Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            className={cn(
                              "h-9 w-full justify-start text-left font-normal",
                              !item.expirationDate && "text-muted-foreground"
                            )}
                            id={`expiration-${item.itemId}`}
                            variant="outline"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {item.expirationDate ? (
                              format(item.expirationDate, "PPP", { locale: es })
                            ) : (
                              <span>Seleccionar fecha</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-auto p-0">
                          <Calendar
                            initialFocus
                            locale={es}
                            mode="single"
                            onSelect={(date) =>
                              onItemChange(item.itemId, {
                                expirationDate: date,
                              })
                            }
                            selected={item.expirationDate}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs" htmlFor={`lot-${item.itemId}`}>
                        Número de lote
                      </Label>
                      <Input
                        className="h-9"
                        id={`lot-${item.itemId}`}
                        onChange={(e) =>
                          onItemChange(item.itemId, {
                            lotNumber: e.target.value,
                          })
                        }
                        placeholder="Ingrese el lote"
                        value={item.lotNumber ?? ""}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
