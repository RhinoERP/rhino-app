"use client";

import { CalendarIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { receivePurchaseAction } from "@/modules/purchases/actions/receive-purchase.action";
import type {
  PurchaseOrder,
  PurchaseOrderItem,
} from "@/modules/purchases/service/purchases.service";

type ReceivedItem = {
  itemId: string;
  productId: string;
  received: boolean;
  unitQuantity?: number;
  quantity?: number;
  expirationDate?: Date;
  lotNumber?: string;
};

type PurchaseReceiptProps = {
  purchaseOrder: PurchaseOrder & {
    items: (PurchaseOrderItem & {
      product_name?: string;
    })[];
  };
  orgSlug: string;
};

export function PurchaseReceipt({
  purchaseOrder,
  orgSlug,
}: PurchaseReceiptProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receivedItems, setReceivedItems] = useState<ReceivedItem[]>(
    purchaseOrder.items.map((item) => ({
      itemId: item.id,
      productId: item.product_id,
      received: false,
      unitQuantity: item.unit_quantity ?? undefined,
      quantity: item.quantity ?? undefined,
      expirationDate: undefined,
      lotNumber: undefined,
    }))
  );

  const handleToggleReceived = (itemId: string) => {
    setReceivedItems((prev) =>
      prev.map((item) =>
        item.itemId === itemId ? { ...item, received: !item.received } : item
      )
    );
  };

  const handleUpdateField = (
    itemId: string,
    field: keyof ReceivedItem,
    value: unknown
  ) => {
    setReceivedItems((prev) =>
      prev.map((item) =>
        item.itemId === itemId ? { ...item, [field]: value } : item
      )
    );
  };

  const validateReceivedItems = (items: ReceivedItem[]) => {
    for (const item of items) {
      if (!item.lotNumber?.trim()) {
        throw new Error(
          `El producto ${item.productId} requiere un número de lote`
        );
      }
      if (!item.expirationDate) {
        throw new Error(
          `El producto ${item.productId} requiere una fecha de vencimiento`
        );
      }
    }
  };

  const mapReceivedItemsToInput = (items: ReceivedItem[]) =>
    items.map((item) => ({
      itemId: item.itemId,
      productId: item.productId,
      received: item.received,
      unitQuantity: item.unitQuantity,
      quantity: item.quantity,
      expirationDate: item.expirationDate
        ? item.expirationDate.toISOString().split("T")[0]
        : undefined,
      lotNumber: item.lotNumber,
    }));

  const handleSubmit = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      const itemsToReceive = receivedItems.filter((item) => item.received);
      validateReceivedItems(itemsToReceive);

      const result = await receivePurchaseAction({
        orgSlug,
        purchaseOrderId: purchaseOrder.id,
        receivedItems: mapReceivedItemsToInput(receivedItems),
      });

      if (result.success) {
        router.push(`/org/${orgSlug}/compras/${purchaseOrder.id}`);
        router.refresh();
      } else {
        setError(result.error ?? "Error al recibir el pedido");
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Error desconocido al recibir el pedido";
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const allReceived = receivedItems.every((item) => item.received);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Checklist de Productos Recibidos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Marque los productos que han llegado y ajuste las cantidades si es
            necesario. Ingrese el vencimiento de cada producto.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Productos</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12" />
                <TableHead>Producto</TableHead>
                <TableHead>Unidades Pedidas</TableHead>
                <TableHead>Kg Pedido</TableHead>
                <TableHead>Unidades Recibidas</TableHead>
                <TableHead>Kg Recibido</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead>Lote</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchaseOrder.items.map((item) => {
                const receivedItem = receivedItems.find(
                  (ri) => ri.itemId === item.id
                );
                if (!receivedItem) {
                  return null;
                }

                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Checkbox
                        checked={receivedItem.received}
                        onCheckedChange={() => handleToggleReceived(item.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {(
                        item as PurchaseOrderItem & {
                          product_name?: string;
                        }
                      ).product_name || item.product_id}
                    </TableCell>
                    <TableCell>{item.unit_quantity ?? "-"}</TableCell>
                    <TableCell>
                      {item.quantity
                        ? `${item.quantity.toLocaleString("es-AR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })} kg`
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 w-20"
                        disabled={!receivedItem.received}
                        min="0"
                        onChange={(e) =>
                          handleUpdateField(
                            item.id,
                            "unitQuantity",
                            Number.parseFloat(e.target.value) || undefined
                          )
                        }
                        type="number"
                        value={receivedItem.unitQuantity ?? ""}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 w-20"
                        disabled={!receivedItem.received}
                        min="0"
                        onChange={(e) =>
                          handleUpdateField(
                            item.id,
                            "quantity",
                            Number.parseFloat(e.target.value) || undefined
                          )
                        }
                        placeholder="0.00"
                        step="0.01"
                        type="number"
                        value={receivedItem.quantity ?? ""}
                      />
                    </TableCell>
                    <TableCell>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            className={cn(
                              "h-8 w-full justify-start text-left font-normal",
                              !receivedItem.expirationDate &&
                                "text-muted-foreground"
                            )}
                            disabled={!receivedItem.received}
                            variant="outline"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {receivedItem.expirationDate ? (
                              format(receivedItem.expirationDate, "PPP", {
                                locale: es,
                              })
                            ) : (
                              <span>Seleccionar</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-auto p-0">
                          <Calendar
                            initialFocus
                            locale={es}
                            mode="single"
                            onSelect={(date) =>
                              handleUpdateField(item.id, "expirationDate", date)
                            }
                            selected={receivedItem.expirationDate}
                          />
                        </PopoverContent>
                      </Popover>
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 w-32"
                        disabled={!receivedItem.received}
                        onChange={(e) =>
                          handleUpdateField(
                            item.id,
                            "lotNumber",
                            e.target.value
                          )
                        }
                        placeholder="Número de lote"
                        value={receivedItem.lotNumber ?? ""}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Información de Factura y Pago</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="invoice_type">Tipo de documento</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                id="invoice_type"
              >
                <option value="FACTURA_A">Factura A</option>
                <option value="FACTURA_B">Factura B</option>
                <option value="FACTURA_C">Factura C</option>
                <option value="NOTA_DE_VENTA">Nota de Venta</option>
                <option value="REMITO">Remito</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment_due_date">Plazo de pago</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      "text-muted-foreground"
                    )}
                    variant="outline"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    Seleccionar fecha
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-0">
                  <Calendar locale={es} mode="single" />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="total_amount">Monto total</Label>
              <Input
                id="total_amount"
                placeholder="0.00"
                readOnly
                step="0.01"
                type="number"
                value={purchaseOrder.total_amount ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment_method">Tipo de pago</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                id="payment_method"
              >
                <option value="EFECTIVO">Efectivo</option>
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="CHEQUE">Cheque</option>
                <option value="TARJETA_CREDITO">Tarjeta de Crédito</option>
                <option value="TARJETA_DEBITO">Tarjeta de Débito</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button
          disabled={!allReceived || isSubmitting}
          onClick={handleSubmit}
          size="lg"
        >
          <CheckCircleIcon className="mr-2 h-4 w-4" />
          {isSubmitting ? "Procesando..." : "Confirmar Recepción Completa"}
        </Button>
      </div>
    </div>
  );
}
