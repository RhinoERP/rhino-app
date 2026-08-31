"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Category } from "@/modules/categories/types";
import { confirmDraftPurchaseAction } from "@/modules/purchases/actions/confirm-draft-purchase.action";
import { useUpdatePurchaseOrder } from "@/modules/purchases/hooks/use-update-purchase-order";
import { useUpdatePurchaseStatus } from "@/modules/purchases/hooks/use-update-purchase-status";
import type {
  ProductWithPrice,
  PurchaseOrder,
  PurchaseOrderItem,
} from "@/modules/purchases/service/purchases.service";
import type { Supplier } from "@/modules/suppliers/service/suppliers.service";
import { PurchaseDetailForm } from "./purchase-detail-form";
import {
  PurchaseDetailHeader,
  PurchaseStatusBadge,
} from "./purchase-detail-header";
import type { PurchaseDetailItem } from "./purchase-detail-items";
import { PurchaseDetailItems } from "./purchase-detail-items";
import { PurchaseDetailSummary } from "./purchase-detail-summary";

type PurchaseOrderWithItems = PurchaseOrder & {
  items: (PurchaseOrderItem & {
    product_name?: string;
    weight_per_unit?: number | null;
    unit_of_measure?: string | null;
    total_weight_kg?: number | null;
    has_variants?: boolean;
  })[];
  taxes: Array<{
    tax_id: string;
    name: string;
    rate: number;
  }> | null;
};

type PurchaseDetailProps = {
  orgSlug: string;
  purchaseOrder: PurchaseOrderWithItems;
  relatedOrder?: { id: string; order_number: string } | null;
  suppliers: Supplier[];
  products: ProductWithPrice[];
  categories?: Category[];
};

function toDateOnlyString(date: Date): string {
  return date.toISOString().split("T")[0] ?? "";
}

function mapPurchaseOrderItemToDetailItem(
  item: PurchaseOrderWithItems["items"][number]
): PurchaseDetailItem {
  const variantStocks = item.variant_stocks as
    | Record<string, Record<string, number>>
    | null
    | undefined;
  const unitOfMeasure = item.unit_of_measure;
  const weightPerUnit = item.weight_per_unit;
  const isWeightOrVolume = ["KG", "LT", "MT"].includes(unitOfMeasure ?? "");

  const pricePerKg =
    unitOfMeasure === "KG" && item.unit_cost ? item.unit_cost : undefined;

  const quantity = item.quantity ?? 0;

  const unitQuantity =
    item.unit_quantity ??
    (isWeightOrVolume && weightPerUnit && quantity > 0
      ? quantity * weightPerUnit
      : quantity);

  const totalWeightKg =
    isWeightOrVolume && unitQuantity && weightPerUnit ? unitQuantity : null;

  return {
    id: item.id,
    product_id: item.product_id,
    product_name: item.product_name ?? item.product_id,
    quantity,
    unit_quantity: unitQuantity,
    unit_cost: item.unit_cost ?? 0,
    subtotal: item.subtotal ?? 0,
    unit_of_measure: unitOfMeasure ?? undefined,
    weight_per_unit: weightPerUnit ?? undefined,
    total_weight_kg: totalWeightKg,
    price_per_kg: pricePerKg,
    discount_percent: 0,
    has_variants: item.has_variants,
    variant_stocks: variantStocks ?? null,
  };
}

export function PurchaseDetail({
  orgSlug,
  purchaseOrder,
  relatedOrder,
  suppliers,
  products,
  categories = [],
}: PurchaseDetailProps) {
  const router = useRouter();
  const updatePurchase = useUpdatePurchaseOrder(orgSlug);
  const updateStatus = useUpdatePurchaseStatus(orgSlug);

  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [isSupplierPickerOpen, setIsSupplierPickerOpen] = useState(false);
  const [supplierId, setSupplierId] = useState<string>(
    purchaseOrder.supplier_id ?? ""
  );
  const [purchaseDate, setPurchaseDate] = useState<Date>(
    new Date(purchaseOrder.purchase_date)
  );

  // Calculate expiration days from expiration date
  const [expirationDays, setExpirationDays] = useState<number | null>(() => {
    if (!purchaseOrder.expiration_date) {
      return null;
    }

    const purchaseDateOnly = new Date(purchaseOrder.purchase_date);
    purchaseDateOnly.setHours(0, 0, 0, 0);

    const expirationDateOnly = new Date(purchaseOrder.expiration_date);
    expirationDateOnly.setHours(0, 0, 0, 0);

    const diffMs = expirationDateOnly.getTime() - purchaseDateOnly.getTime();
    const days = Math.round(diffMs / (1000 * 60 * 60 * 24));

    return days >= 0 ? days : null;
  });

  const [remittanceNumber, setRemittanceNumber] = useState<string>(
    purchaseOrder.remittance_number ?? ""
  );
  const [globalDiscountPercentage, setGlobalDiscountPercentage] =
    useState<number>(purchaseOrder.global_discount_percentage ?? 0);
  const [isInTransitDialogOpen, setIsInTransitDialogOpen] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [items, setItems] = useState<PurchaseDetailItem[]>(() =>
    purchaseOrder.items.map(mapPurchaseOrderItemToDetailItem)
  );
  const [isConfirmingDraft, setIsConfirmingDraft] = useState(false);
  const isDraftSale = purchaseOrder.status === "DRAFT";
  const [error, setError] = useState<string | null>(null);

  const purchaseDateString = useMemo(
    () => toDateOnlyString(purchaseDate),
    [purchaseDate]
  );

  const expirationDateString = useMemo(() => {
    if (
      typeof expirationDays === "number" &&
      !Number.isNaN(expirationDays) &&
      expirationDays >= 0
    ) {
      const purchaseDateOnly = purchaseDate.toISOString().split("T")[0] ?? "";
      const expDate = new Date(purchaseDateOnly);
      expDate.setDate(expDate.getDate() + expirationDays);
      return expDate.toISOString().split("T")[0] ?? "";
    }
    return null;
  }, [expirationDays, purchaseDate]);

  const buildSavePayload = () => ({
    orgSlug,
    purchaseOrderId: purchaseOrder.id,
    supplier_id: supplierId,
    purchase_date: purchaseDateString,
    expiration_date: expirationDateString,
    remittance_number: remittanceNumber || null,
    items: items.map((item) => ({
      id: item.id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_quantity: item.unit_quantity,
      unit_cost: item.unit_cost,
      subtotal: item.subtotal,
      unit_of_measure: item.unit_of_measure,
      variant_stocks: item.variant_stocks ?? null,
    })),
    global_discount_percentage:
      globalDiscountPercentage > 0 ? globalDiscountPercentage : undefined,
  });

  const handleSave = async () => {
    if (!supplierId) {
      setError("Debe seleccionar un proveedor");
      return;
    }

    if (items.length === 0) {
      setError("Debe agregar al menos un producto");
      return;
    }

    setError(null);

    try {
      const result = await updatePurchase.mutateAsync(buildSavePayload());

      if (result.success) {
        setIsEditingDetails(false);
        router.refresh();
      } else {
        setError(result.error ?? "No se pudo actualizar la compra");
      }
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "No se pudo actualizar la compra, intenta nuevamente."
      );
    }
  };

  const handleStatusChange = async (
    newStatus: "ORDERED" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED"
  ) => {
    if (isUpdatingStatus) {
      return;
    }

    // If status is RECEIVED, just redirect to receipt page without updating status
    if (newStatus === "RECEIVED") {
      router.push(`/org/${orgSlug}/compras/${purchaseOrder.id}/recibir`);
      return;
    }

    setIsUpdatingStatus(true);
    setError(null);

    try {
      const result = await updateStatus.mutateAsync({
        purchaseOrderId: purchaseOrder.id,
        status: newStatus,
      });

      if (result.success) {
        router.refresh();
      } else {
        setError(result.error ?? "No se pudo actualizar el estado");
      }
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "No se pudo actualizar el estado, intenta nuevamente."
      );
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleConfirmDraft = async () => {
    if (isConfirmingDraft) {
      return;
    }

    if (!supplierId) {
      setError("Seleccioná un proveedor antes de confirmar la pre-compra");
      return;
    }

    setIsConfirmingDraft(true);
    setError(null);
    try {
      await saveDraftIfEditing();
      await confirmDraftAndRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al confirmar");
    } finally {
      setIsConfirmingDraft(false);
    }
  };

  const saveDraftIfEditing = async () => {
    if (!isEditingDetails) {
      return;
    }

    const result = await updatePurchase.mutateAsync(buildSavePayload());

    if (!result.success) {
      throw new Error(result.error ?? "Error al guardar cambios");
    }
  };

  const confirmDraftAndRefresh = async () => {
    const result = await confirmDraftPurchaseAction({
      orgSlug,
      purchaseOrderId: purchaseOrder.id,
      supplierId,
      expirationDate: purchaseOrder.expiration_date ?? undefined,
    });

    if (!result.success) {
      throw new Error(result.error ?? "Error al confirmar pre-compra");
    }

    router.refresh();
  };

  return (
    <div className="space-y-6">
      <PurchaseDetailHeader
        isEditingDetails={isEditingDetails}
        isInTransitDialogOpen={isInTransitDialogOpen}
        isUpdatingStatus={isUpdatingStatus}
        onEditToggle={() => setIsEditingDetails((prev) => !prev)}
        onInTransitDialogChange={setIsInTransitDialogOpen}
        onInTransitDialogOpen={() => setIsInTransitDialogOpen(true)}
        onStatusChange={handleStatusChange}
        orgSlug={orgSlug}
        purchaseOrder={purchaseOrder}
      />

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-3xl">
            Compra #
            {purchaseOrder.purchase_number?.toString().padStart(6, "0") ??
              "N/A"}
          </h1>
          <PurchaseStatusBadge purchaseOrder={purchaseOrder} />
        </div>
      </div>

      {relatedOrder ? (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
          <p className="font-medium text-sm text-yellow-800">
            Pre-compra generada a partir de un pedido
          </p>
          <Link
            className="mt-1 inline-block font-medium text-sm text-yellow-700 underline underline-offset-2 hover:text-yellow-600"
            href={`/org/${orgSlug}/pedidos/${relatedOrder.id}`}
          >
            Ver pedido {relatedOrder.order_number}
          </Link>
        </div>
      ) : null}

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-6">
          <PurchaseDetailForm
            expirationDays={expirationDays}
            globalDiscountPercentage={globalDiscountPercentage}
            isEditingDetails={isEditingDetails}
            isSupplierPickerOpen={isSupplierPickerOpen}
            onExpirationDaysChange={setExpirationDays}
            onGlobalDiscountPercentageChange={setGlobalDiscountPercentage}
            onPurchaseDateChange={setPurchaseDate}
            onRemittanceNumberChange={setRemittanceNumber}
            onSupplierChange={setSupplierId}
            onSupplierPickerOpenChange={setIsSupplierPickerOpen}
            purchaseDate={purchaseDate}
            remittanceNumber={remittanceNumber}
            supplierId={supplierId}
            suppliers={suppliers}
          />

          <PurchaseDetailItems
            categories={categories}
            isEditingDetails={isEditingDetails}
            items={items}
            onError={setError}
            onItemsChange={setItems}
            products={products}
            supplierId={supplierId}
          />
        </div>

        <PurchaseDetailSummary
          error={error}
          globalDiscountPercentage={
            isEditingDetails
              ? globalDiscountPercentage
              : (purchaseOrder.global_discount_percentage ?? null)
          }
          isConfirmingDraft={isConfirmingDraft}
          isDraftSale={isDraftSale}
          isEditingDetails={isEditingDetails}
          isSaving={updatePurchase.isPending}
          items={items}
          onConfirmDraft={handleConfirmDraft}
          onSave={handleSave}
          purchaseOrderTaxes={purchaseOrder.taxes}
          supplierId={supplierId}
        />
      </div>
    </div>
  );
}
