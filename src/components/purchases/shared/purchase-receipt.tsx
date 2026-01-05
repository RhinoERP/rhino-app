"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { receivePurchaseAction } from "@/modules/purchases/actions/receive-purchase.action";
import type {
  PurchaseOrder,
  PurchaseOrderItem,
} from "@/modules/purchases/service/purchases.service";
import type { Tax } from "@/modules/taxes/service/taxes.service";
import { PurchaseReceiptItems } from "./purchase-receipt-items";
import { PurchaseReceiptSummary } from "./purchase-receipt-summary";
import { PurchaseReceiptTaxes } from "./purchase-receipt-taxes";

export type ReceivedItem = {
  itemId: string;
  productId: string;
  product_name?: string;
  received: boolean;
  unitQuantity: number;
  quantity: number;
  unitCost: number;
  subtotal: number;
  expirationDate?: Date;
  lotNumber?: string;
  unit_of_measure?: string | null;
  weight_per_unit?: number | null;
};

type PurchaseReceiptProps = {
  purchaseOrder: PurchaseOrder & {
    items: (PurchaseOrderItem & {
      product_name?: string;
      unit_of_measure?: string | null;
      weight_per_unit?: number | null;
    })[];
    taxes: Array<{
      tax_id: string;
      name: string;
      rate: number;
    }> | null;
  };
  orgSlug: string;
  allTaxes: Tax[];
};

export function PurchaseReceipt({
  purchaseOrder,
  orgSlug,
  allTaxes,
}: PurchaseReceiptProps) {
  const router = useRouter();
  const [isReceiving, setIsReceiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [receivedItems, setReceivedItems] = useState<ReceivedItem[]>(
    purchaseOrder.items.map((item) => ({
      itemId: item.id,
      productId: item.product_id,
      product_name: item.product_name,
      received: false,
      unitQuantity: item.unit_quantity ?? 0,
      quantity: item.quantity ?? 0,
      unitCost: item.unit_cost ?? 0,
      subtotal: item.subtotal ?? 0,
      unit_of_measure: item.unit_of_measure ?? null,
      weight_per_unit: item.weight_per_unit ?? null,
      expirationDate: undefined,
      lotNumber: undefined,
    }))
  );

  const [selectedTaxIds, setSelectedTaxIds] = useState<string[]>(
    () => purchaseOrder.taxes?.map((tax) => tax.tax_id) ?? []
  );

  const selectedTaxes = useMemo(
    () => allTaxes.filter((tax) => selectedTaxIds.includes(tax.id)),
    [allTaxes, selectedTaxIds]
  );

  const handleToggleTax = (taxId: string) => {
    setSelectedTaxIds((prev) =>
      prev.includes(taxId)
        ? prev.filter((id) => id !== taxId)
        : [...prev, taxId]
    );
  };

  const handleItemChange = (itemId: string, updates: Partial<ReceivedItem>) => {
    setReceivedItems((prev) =>
      prev.map((item) => {
        if (item.itemId !== itemId) {
          return item;
        }

        const updated = { ...item, ...updates };

        // Recalculate subtotal if quantity or price changed
        // Subtotal = quantity (kg/lt) × unit_cost (price per unit of measure)
        if (updates.quantity !== undefined || updates.unitCost !== undefined) {
          updated.subtotal = updated.quantity * updated.unitCost;
        }

        return updated;
      })
    );
  };

  const validateReceivedItems = (items: ReceivedItem[]) => {
    for (const item of items) {
      if (!item.lotNumber?.trim()) {
        throw new Error(
          `El producto ${item.product_name ?? item.productId} requiere un número de lote`
        );
      }
      if (!item.expirationDate) {
        throw new Error(
          `El producto ${item.product_name ?? item.productId} requiere una fecha de vencimiento`
        );
      }
    }
  };

  const handleReceive = async () => {
    setError(null);
    setSuccessMessage(null);
    setIsReceiving(true);

    try {
      const itemsToReceive = receivedItems.filter((item) => item.received);

      if (itemsToReceive.length === 0) {
        setError("Debe marcar al menos un producto como recibido");
        setIsReceiving(false);
        return;
      }

      validateReceivedItems(itemsToReceive);

      const result = await receivePurchaseAction({
        orgSlug,
        purchaseOrderId: purchaseOrder.id,
        receivedItems: receivedItems.map((item) => ({
          itemId: item.itemId,
          productId: item.productId,
          received: item.received,
          unitQuantity: item.unitQuantity,
          quantity: item.quantity,
          expirationDate: item.expirationDate
            ? item.expirationDate.toISOString().split("T")[0]
            : undefined,
          lotNumber: item.lotNumber,
          unitCost: item.unitCost,
        })),
      });

      if (result.success) {
        router.push(`/org/${orgSlug}/compras/${purchaseOrder.id}`);
        router.refresh();
      } else {
        setError(result.error ?? "Error al recibir el pedido");
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Error desconocido";
      setError(errorMessage);
    } finally {
      setIsReceiving(false);
    }
  };

  const receivedCount = receivedItems.filter((item) => item.received).length;
  const totalItems = receivedItems.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/org/${orgSlug}/compras/${purchaseOrder.id}`}>
          <Button size="sm" variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a compra
          </Button>
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="font-heading text-3xl">
          Recepción de Compra #
          {purchaseOrder.purchase_number?.toString().padStart(6, "0") ?? "N/A"}
        </h1>
        <p className="text-muted-foreground">
          Ajuste las cantidades, precios e impuestos antes de recibir los
          productos
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-red-900 text-sm">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="rounded-md border border-green-200 bg-green-50 p-4">
          <p className="text-green-900 text-sm">{successMessage}</p>
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-6">
          <PurchaseReceiptItems
            items={receivedItems}
            onItemChange={handleItemChange}
          />

          <PurchaseReceiptTaxes
            allTaxes={allTaxes}
            onToggleTax={handleToggleTax}
            selectedTaxIds={selectedTaxIds}
          />
        </div>

        <PurchaseReceiptSummary
          error={error}
          isReceiving={isReceiving}
          items={receivedItems}
          onReceive={handleReceive}
          receivedCount={receivedCount}
          selectedTaxes={selectedTaxes}
          successMessage={successMessage}
          totalItems={totalItems}
        />
      </div>
    </div>
  );
}
