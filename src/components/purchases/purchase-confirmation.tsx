"use client";

import { CalendarIcon, TruckIcon } from "@phosphor-icons/react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useUpdatePurchaseStatus } from "@/modules/purchases/hooks/use-update-purchase-status";
import type {
  PurchaseOrder,
  PurchaseOrderItem,
} from "@/modules/purchases/service/purchases.service";
import { Calendar } from "../ui/calendar";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

type PurchaseConfirmationProps = {
  purchaseOrder: PurchaseOrder & {
    items: (PurchaseOrderItem & { product_name?: string })[];
  };
  orgSlug: string;
};

export function PurchaseConfirmation({
  purchaseOrder,
  orgSlug,
}: PurchaseConfirmationProps) {
  const router = useRouter();
  const updateStatus = useUpdatePurchaseStatus(orgSlug);
  const [deliveryDate, setDeliveryDate] = useState<Date | undefined>();
  const [logistics, setLogistics] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleMarkInTransit = async () => {
    if (!(deliveryDate && logistics.trim())) {
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await updateStatus.mutateAsync({
        purchaseOrderId: purchaseOrder.id,
        status: "IN_TRANSIT",
        options: {
          delivery_date: deliveryDate.toISOString().split("T")[0],
          logistics: logistics.trim(),
        },
      });

      if (result.success) {
        router.push(`/org/${orgSlug}/compras/${purchaseOrder.id}`);
        router.refresh();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmReceived = async () => {
    const result = await updateStatus.mutateAsync({
      purchaseOrderId: purchaseOrder.id,
      status: "RECEIVED",
    });

    if (result.success) {
      router.push(`/org/${orgSlug}/compras/${purchaseOrder.id}/recibir`);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TruckIcon className="h-5 w-5 text-orange-500" />
            <CardTitle>Pedido en Camino</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            El pedido ha sido confirmado y está en tránsito. Cuando llegue la
            mercadería, podrá confirmar la recepción y ajustar las cantidades
            recibidas.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Información del Pedido</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground text-sm">Fecha de compra</p>
              <p className="font-medium">
                {formatDateOnly(purchaseOrder.purchase_date)}
              </p>
            </div>
            {purchaseOrder.payment_due_date && (
              <div>
                <p className="text-muted-foreground text-sm">
                  Fecha de vencimiento
                </p>
                <p className="font-medium">
                  {formatDateOnly(purchaseOrder.payment_due_date)}
                </p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground text-sm">Total</p>
              <p className="font-semibold text-lg">
                {formatCurrency(purchaseOrder.total_amount)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Productos Pedidos</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Unidades</TableHead>
                <TableHead>Kg</TableHead>
                <TableHead>Precio Unitario</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchaseOrder.items.map((item) => {
                const itemWithName = item as PurchaseOrderItem & {
                  product_name?: string;
                };
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {itemWithName.product_name || item.product_id}
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
                    <TableCell>{formatCurrency(item.unit_cost ?? 0)}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.subtotal ?? 0)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {purchaseOrder.status === "ORDERED" && (
        <Card>
          <CardHeader>
            <CardTitle>Marcar como En Tránsito</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="delivery_date">Fecha estimada de entrega</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !deliveryDate && "text-muted-foreground"
                      )}
                      id="delivery_date"
                      variant="outline"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {deliveryDate ? (
                        format(deliveryDate, "PPP", { locale: es })
                      ) : (
                        <span>Seleccione una fecha</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto p-0">
                    <Calendar
                      initialFocus
                      locale={es}
                      mode="single"
                      onSelect={setDeliveryDate}
                      selected={deliveryDate}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label htmlFor="logistics">Empresa de logística</Label>
                <Input
                  id="logistics"
                  onChange={(e) => setLogistics(e.target.value)}
                  placeholder="Nombre de la empresa"
                  value={logistics}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                disabled={!(deliveryDate && logistics.trim()) || isSubmitting}
                onClick={handleMarkInTransit}
                size="lg"
              >
                <TruckIcon className="mr-2 h-4 w-4" />
                Marcar como En Tránsito
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {purchaseOrder.status === "IN_TRANSIT" && (
        <div className="flex justify-end">
          <Button onClick={handleConfirmReceived} size="lg">
            Confirmar Recepción del Pedido
          </Button>
        </div>
      )}
    </div>
  );
}
