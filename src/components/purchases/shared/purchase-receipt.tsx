"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { receivePurchaseAction } from "@/modules/purchases/actions/receive-purchase.action";
import {
  purchaseOrderQueryKey,
  purchasesQueryKey,
} from "@/modules/purchases/queries/query-keys";
import type {
  PurchaseOrder,
  PurchaseOrderItem,
} from "@/modules/purchases/service/purchases.service";
import { PurchaseReceiptItems } from "./purchase-receipt-items";
import { PurchaseReceiptSummary } from "./purchase-receipt-summary";

export type LotEntryForm = {
  /** Client-side unique key for useFieldArray */
  _key: string;
  lotNumber: string;
  expirationDate?: Date;
  quantity: number;
  unitQuantity: number;
};

export type ReceivedItemForm = {
  itemId: string;
  productId: string;
  product_name?: string;
  received: boolean;
  /** Total ordered quantity in units */
  orderedQuantity: number;
  /** Total ordered unit quantity (kg/lt/mt) */
  orderedUnitQuantity: number;
  unitCost: number;
  unit_of_measure?: string | null;
  weight_per_unit?: number | null;
  lots: LotEntryForm[];
};

export type ReceiptFormValues = {
  items: ReceivedItemForm[];
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
  allTaxes: unknown[];
};

function buildInitialItems(
  purchaseOrder: PurchaseReceiptProps["purchaseOrder"]
): ReceivedItemForm[] {
  return purchaseOrder.items.map((item) => ({
    itemId: item.id,
    productId: item.product_id,
    product_name: item.product_name,
    received: false,
    orderedQuantity: item.quantity ?? 0,
    orderedUnitQuantity: item.unit_quantity ?? 0,
    unitCost: item.unit_cost ?? 0,
    unit_of_measure: item.unit_of_measure ?? null,
    weight_per_unit: item.weight_per_unit ?? null,
    lots: [
      {
        _key: crypto.randomUUID(),
        lotNumber: "",
        expirationDate: undefined,
        quantity: item.quantity ?? 0,
        unitQuantity: item.unit_quantity ?? 0,
      },
    ],
  }));
}

function validateSingleLot(
  lot: LotEntryForm,
  productLabel: string
): string | null {
  if (!lot.lotNumber.trim()) {
    return `El producto ${productLabel} tiene un lote sin número`;
  }
  if (!lot.expirationDate) {
    return `El producto ${productLabel} tiene un lote sin fecha de vencimiento`;
  }
  if (lot.quantity <= 0 && lot.unitQuantity <= 0) {
    return `El producto ${productLabel} tiene un lote con cantidad 0`;
  }
  return null;
}

function validateLots(items: ReceivedItemForm[]): string | null {
  for (const item of items) {
    const label = item.product_name ?? item.productId;
    if (item.lots.length === 0) {
      return `El producto ${label} debe tener al menos un lote`;
    }
    for (const lot of item.lots) {
      const lotError = validateSingleLot(lot, label);
      if (lotError) {
        return lotError;
      }
    }
  }
  return null;
}

function buildActionInput(
  orgSlug: string,
  purchaseOrderId: string,
  itemsToReceive: ReceivedItemForm[]
) {
  return {
    orgSlug,
    purchaseOrderId,
    receivedItems: itemsToReceive.map((item) => ({
      itemId: item.itemId,
      productId: item.productId,
      received: true as const,
      unitCost: item.unitCost,
      lots: item.lots.map((lot) => ({
        lotNumber: lot.lotNumber,
        expirationDate: lot.expirationDate
          ? lot.expirationDate.toISOString().split("T")[0]
          : "",
        quantity: lot.quantity,
        unitQuantity: lot.unitQuantity,
      })),
    })),
  };
}

export function PurchaseReceipt({
  purchaseOrder,
  orgSlug,
}: PurchaseReceiptProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm<ReceiptFormValues>({
    defaultValues: {
      items: buildInitialItems(purchaseOrder),
    },
  });

  const { fields: itemFields } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const { formState } = form;
  const isReceiving = formState.isSubmitting;
  const [error, setError] = useState<string | null>(null);

  const items = form.watch("items");

  const handleToggleAll = (checked: boolean) => {
    for (const [index] of items.entries()) {
      form.setValue(`items.${index}.received`, checked);
    }
  };

  const handleReceive = form.handleSubmit(async (values) => {
    setError(null);

    const itemsToReceive = values.items.filter((item) => item.received);

    if (itemsToReceive.length === 0) {
      setError("Debe marcar al menos un producto como recibido");
      return;
    }

    const validationError = validateLots(itemsToReceive);
    if (validationError) {
      setError(validationError);
      return;
    }

    const result = await receivePurchaseAction(
      buildActionInput(orgSlug, purchaseOrder.id, itemsToReceive)
    );

    if (result.success) {
      const keysToInvalidate = result.invalidatedQueryKeys ?? [
        purchasesQueryKey(orgSlug),
        purchaseOrderQueryKey(orgSlug, purchaseOrder.id),
      ];
      await Promise.all(
        keysToInvalidate.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey: [...queryKey] })
        )
      );
      router.push(`/org/${orgSlug}/compras/${purchaseOrder.id}`);
      router.refresh();
    } else {
      setError(result.error ?? "Error al recibir el pedido");
    }
  });

  const receivedCount = items.filter((item) => item.received).length;
  const totalItems = items.length;
  const allSelected = totalItems > 0 && receivedCount === totalItems;

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
          Ajuste las cantidades y precios antes de recibir los productos
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-red-900 text-sm">{error}</p>
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-6">
          <PurchaseReceiptItems
            allSelected={allSelected}
            control={form.control}
            isProcessing={isReceiving}
            itemFields={itemFields}
            onProcessSelected={handleReceive}
            onToggleAll={handleToggleAll}
            selectedCount={receivedCount}
            watch={form.watch}
          />
        </div>

        <PurchaseReceiptSummary
          error={error}
          globalDiscountPercentage={purchaseOrder.global_discount_percentage}
          isReceiving={isReceiving}
          items={items}
          onReceive={handleReceive}
          receivedCount={receivedCount}
          taxes={purchaseOrder.taxes || []}
          totalItems={totalItems}
        />
      </div>
    </div>
  );
}
