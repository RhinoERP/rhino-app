"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { AsientoModal } from "@/components/accounting/asiento-modal";
import type { EventoFacturaCompra } from "@/modules/accounting/types";
import type { Category } from "@/modules/categories/types";
import { useUpdatePurchaseOrder } from "@/modules/purchases/hooks/use-update-purchase-order";
import { useUpdatePurchaseStatus } from "@/modules/purchases/hooks/use-update-purchase-status";
import type {
  ProductWithPrice,
  PurchaseOrder,
  PurchaseOrderItem,
} from "@/modules/purchases/service/purchases.service";
import type { Supplier } from "@/modules/suppliers/service/suppliers.service";
import type { Tax } from "@/modules/taxes/types";
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
    unit_of_measure?: string;
    total_weight_kg?: number | null;
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
  suppliers: Supplier[];
  taxes: Tax[];
  products: ProductWithPrice[];
  categories?: Category[];
};

function toDateOnlyString(date: Date): string {
  return date.toISOString().split("T")[0] ?? "";
}

function mapPurchaseOrderItemToDetailItem(
  item: PurchaseOrderWithItems["items"][number]
): PurchaseDetailItem {
  const unitOfMeasure = item.unit_of_measure;
  const weightPerUnit = item.weight_per_unit;
  const isWeightOrVolume =
    unitOfMeasure === "KG" || unitOfMeasure === "LT" || unitOfMeasure === "MT";

  const pricePerKg =
    unitOfMeasure === "KG" && item.unit_cost ? item.unit_cost : undefined;

  const quantity = item.quantity ?? 0;

  let unitQuantity: number;
  if (item.unit_quantity != null) {
    unitQuantity = item.unit_quantity;
  } else if (isWeightOrVolume && weightPerUnit && quantity > 0) {
    unitQuantity = quantity * weightPerUnit;
  } else {
    unitQuantity = quantity;
  }

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
  };
}

export function PurchaseDetail({
  orgSlug,
  purchaseOrder,
  suppliers,
  taxes,
  products,
  categories = [],
}: PurchaseDetailProps) {
  const router = useRouter();
  const updatePurchase = useUpdatePurchaseOrder(orgSlug);
  const updateStatus = useUpdatePurchaseStatus(orgSlug);

  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [isSupplierPickerOpen, setIsSupplierPickerOpen] = useState(false);
  const [isTaxesPickerOpen, setIsTaxesPickerOpen] = useState(false);
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
  const [selectedTaxIds, setSelectedTaxIds] = useState<string[]>(
    () => purchaseOrder.taxes?.map((tax) => tax.tax_id) ?? []
  );
  const [globalDiscountPercentage, setGlobalDiscountPercentage] =
    useState<number>(purchaseOrder.global_discount_percentage ?? 0);
  const [isInTransitDialogOpen, setIsInTransitDialogOpen] = useState(false);
  const [accountingPayload, setAccountingPayload] =
    useState<EventoFacturaCompra | null>(null);
  const lastPayloadRef = useRef<EventoFacturaCompra | null>(null);
  if (accountingPayload !== null) {
    lastPayloadRef.current = accountingPayload;
  }
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [items, setItems] = useState<PurchaseDetailItem[]>(() =>
    purchaseOrder.items.map(mapPurchaseOrderItemToDetailItem)
  );
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

  const availableTaxes = useMemo(() => {
    const byId = new Map<string, Tax>();

    for (const tax of taxes) {
      byId.set(tax.id, tax);
    }

    for (const applied of purchaseOrder.taxes ?? []) {
      if (applied.tax_id && !byId.has(applied.tax_id)) {
        byId.set(applied.tax_id, {
          id: applied.tax_id,
          name: applied.name,
          rate: applied.rate,
          code: null,
          description: null,
          created_at: null,
          updated_at: null,
          is_favorite: false,
          is_favorite_sales: false,
          is_favorite_direct_sales: false,
          is_active: true,
          organization_id: null,
        });
      }
    }

    return Array.from(byId.values());
  }, [purchaseOrder.taxes, taxes]);

  const selectedTaxes = useMemo(
    () => availableTaxes.filter((tax) => selectedTaxIds.includes(tax.id)),
    [availableTaxes, selectedTaxIds]
  );

  const handleToggleTax = (taxId: string) => {
    setSelectedTaxIds((prev) =>
      prev.includes(taxId)
        ? prev.filter((id) => id !== taxId)
        : [...prev, taxId]
    );
  };

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
      const result = await updatePurchase.mutateAsync({
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
        })),
        taxes: selectedTaxes.map((tax) => ({
          tax_id: tax.id,
          name: tax.name,
          rate: tax.rate,
        })),
        global_discount_percentage:
          globalDiscountPercentage > 0 ? globalDiscountPercentage : undefined,
      });

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

  const handleAccountingDone = () => {
    setAccountingPayload(null);
    router.refresh();
  };

  const handleInTransitAccountingPayload = (payload: EventoFacturaCompra) => {
    setTimeout(() => setAccountingPayload(payload), 0);
  };

  return (
    <div className="space-y-6">
      {lastPayloadRef.current && (
        <AsientoModal
          eventoPayload={lastPayloadRef.current}
          mode="gate"
          onCancel={handleAccountingDone}
          onConfirm={handleAccountingDone}
          open={!!accountingPayload}
        />
      )}
      <PurchaseDetailHeader
        isEditingDetails={isEditingDetails}
        isInTransitDialogOpen={isInTransitDialogOpen}
        isUpdatingStatus={isUpdatingStatus}
        onAccountingPayload={handleInTransitAccountingPayload}
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

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-6">
          <PurchaseDetailForm
            expirationDays={expirationDays}
            globalDiscountPercentage={globalDiscountPercentage}
            isEditingDetails={isEditingDetails}
            isSupplierPickerOpen={isSupplierPickerOpen}
            isTaxesPickerOpen={isTaxesPickerOpen}
            onExpirationDaysChange={setExpirationDays}
            onGlobalDiscountPercentageChange={setGlobalDiscountPercentage}
            onPurchaseDateChange={setPurchaseDate}
            onRemittanceNumberChange={setRemittanceNumber}
            onSupplierChange={setSupplierId}
            onSupplierPickerOpenChange={setIsSupplierPickerOpen}
            onTaxesPickerOpenChange={setIsTaxesPickerOpen}
            onTaxToggle={handleToggleTax}
            purchaseDate={purchaseDate}
            remittanceNumber={remittanceNumber}
            selectedTaxIds={selectedTaxIds}
            supplierId={supplierId}
            suppliers={suppliers}
            taxes={availableTaxes}
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
          isEditingDetails={isEditingDetails}
          isSaving={updatePurchase.isPending}
          items={items}
          onSave={handleSave}
          selectedTaxes={selectedTaxes}
        />
      </div>
    </div>
  );
}
