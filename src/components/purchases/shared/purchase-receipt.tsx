"use client";

import { CheckCircleIcon } from "@phosphor-icons/react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, CalendarIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
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
  const receivedCount = receivedItems.filter((item) => item.received).length;
  const totalItems = receivedItems.length;

  const statusInfo = {
    label: "En recepción",
    badgeClass: "border-orange-200 bg-orange-50 text-neutral-900",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/org/${orgSlug}/compras/${purchaseOrder.id}`}>
          <Button size="sm" variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a compra
          </Button>
        </Link>

        <Badge className={cn("border px-3 py-1", statusInfo.badgeClass)}>
          {statusInfo.label}
        </Badge>
      </div>

      <div className="space-y-1">
        <h1 className="font-heading text-3xl">
          Recepción de Compra #
          {purchaseOrder.purchase_number?.toString().padStart(6, "0") ?? "N/A"}
        </h1>
        <p className="text-muted-foreground">
          Confirme los productos recibidos y ajuste las cantidades si es
          necesario
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Checklist de Productos Recibidos
              </CardTitle>
              <CardDescription>
                Marque los productos que han llegado y ajuste las cantidades si
                es necesario. Ingrese el vencimiento de cada producto.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12" />
                    <TableHead>Producto</TableHead>
                    <TableHead>Unidades Pedidas</TableHead>
                    <TableHead>Medida Pedido</TableHead>
                    <TableHead>Unidades Recibidas</TableHead>
                    <TableHead>Medida Recibido</TableHead>
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
                            onCheckedChange={() =>
                              handleToggleReceived(item.id)
                            }
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
                            <PopoverContent
                              align="start"
                              className="w-auto p-0"
                            >
                              <Calendar
                                initialFocus
                                locale={es}
                                mode="single"
                                onSelect={(date) =>
                                  handleUpdateField(
                                    item.id,
                                    "expirationDate",
                                    date
                                  )
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
        </div>

        <div className="w-full lg:w-80 lg:max-w-xs xl:max-w-sm">
          <div className="sticky top-6 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Resumen de Recepción</CardTitle>
                <CardDescription>
                  Estado de los productos recibidos
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Productos recibidos
                    </span>
                    <span>
                      {receivedCount} / {totalItems}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Total de compra
                    </span>
                    <span className="font-semibold">
                      {formatCurrency(purchaseOrder.total_amount ?? 0)}
                    </span>
                  </div>
                </div>

                {error && (
                  <div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
                    {error}
                  </div>
                )}
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  disabled={!allReceived || isSubmitting}
                  onClick={handleSubmit}
                  type="button"
                >
                  <CheckCircleIcon className="mr-2 h-4 w-4" weight="duotone" />
                  {isSubmitting
                    ? "Procesando..."
                    : "Confirmar Recepción Completa"}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
