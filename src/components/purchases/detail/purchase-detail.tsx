"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useUpdatePurchaseOrder } from "@/modules/purchases/hooks/use-update-purchase-order";
import { useUpdatePurchaseStatus } from "@/modules/purchases/hooks/use-update-purchase-status";
import type {
  ProductWithPrice,
  PurchaseOrder,
  PurchaseOrderItem,
} from "@/modules/purchases/service/purchases.service";
import type { Supplier } from "@/modules/suppliers/service/suppliers.service";
import type { Tax } from "@/modules/taxes/service/taxes.service";
import { PurchaseDetailForm } from "./purchase-detail-form";
import { PurchaseDetailHeader } from "./purchase-detail-header";
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
};

type PurchaseDetailProps = {
  orgSlug: string;
  purchaseOrder: PurchaseOrderWithItems;
  suppliers: Supplier[];
  taxes: Tax[];
  products: ProductWithPrice[];
};

function toDateOnlyString(date: Date): string {
  return date.toISOString().split("T")[0] ?? "";
}

export function PurchaseDetail({
  orgSlug,
  purchaseOrder,
  suppliers,
  taxes,
  products,
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
  const [paymentDueDate, setPaymentDueDate] = useState<Date | null>(
    purchaseOrder.payment_due_date
      ? new Date(purchaseOrder.payment_due_date)
      : null
  );
  const [remittanceNumber, setRemittanceNumber] = useState<string>(
    purchaseOrder.remittance_number ?? ""
  );
  const [selectedTaxIds, setSelectedTaxIds] = useState<string[]>([]);
  const [isInTransitDialogOpen, setIsInTransitDialogOpen] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [items, setItems] = useState<PurchaseDetailItem[]>(() =>
    purchaseOrder.items.map((item) => {
      const unitOfMeasure = item.unit_of_measure;
      const pricePerKg =
        unitOfMeasure === "KG" && item.unit_cost ? item.unit_cost : undefined;
      return {
        id: item.id,
        product_id: item.product_id,
        product_name: item.product_name ?? item.product_id,
        quantity: item.quantity,
        unit_quantity: item.unit_quantity ?? 0,
        unit_cost: item.unit_cost ?? 0,
        subtotal: item.subtotal ?? 0,
        unit_of_measure: item.unit_of_measure,
        weight_per_unit: item.weight_per_unit,
        total_weight_kg: item.total_weight_kg,
        price_per_kg: pricePerKg,
      };
    })
  );
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const purchaseDateString = useMemo(
    () => toDateOnlyString(purchaseDate),
    [purchaseDate]
  );
  const paymentDueDateString = useMemo(
    () => (paymentDueDate ? toDateOnlyString(paymentDueDate) : null),
    [paymentDueDate]
  );

  const selectedTaxes = useMemo(
    () => taxes.filter((tax) => selectedTaxIds.includes(tax.id)),
    [taxes, selectedTaxIds]
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
    setSuccessMessage(null);

    try {
      const result = await updatePurchase.mutateAsync({
        orgSlug,
        purchaseOrderId: purchaseOrder.id,
        supplier_id: supplierId,
        purchase_date: purchaseDateString,
        payment_due_date: paymentDueDateString,
        remittance_number: remittanceNumber || null,
        items: items.map((item) => ({
          id: item.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_quantity: item.unit_quantity,
          unit_cost: item.unit_cost,
        })),
        taxes: selectedTaxes.map((tax) => ({
          tax_id: tax.id,
          name: tax.name,
          rate: tax.rate,
        })),
      });

      if (result.success) {
        setSuccessMessage("Compra actualizada correctamente.");
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

    setIsUpdatingStatus(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await updateStatus.mutateAsync({
        purchaseOrderId: purchaseOrder.id,
        status: newStatus,
      });

      if (result.success) {
        setSuccessMessage(`Compra marcada como ${newStatus.toLowerCase()}.`);
        router.refresh();

        if (newStatus === "RECEIVED") {
          router.push(`/org/${orgSlug}/compras/${purchaseOrder.id}/recibir`);
        }
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
        <h1 className="font-heading text-3xl">
          Compra #
          {purchaseOrder.purchase_number?.toString().padStart(6, "0") ?? "N/A"}
        </h1>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-6">
          <PurchaseDetailForm
            isEditingDetails={isEditingDetails}
            isSupplierPickerOpen={isSupplierPickerOpen}
            isTaxesPickerOpen={isTaxesPickerOpen}
            onPaymentDueDateChange={setPaymentDueDate}
            onPurchaseDateChange={setPurchaseDate}
            onRemittanceNumberChange={setRemittanceNumber}
            onSupplierChange={setSupplierId}
            onSupplierPickerOpenChange={setIsSupplierPickerOpen}
            onTaxesPickerOpenChange={setIsTaxesPickerOpen}
            onTaxToggle={handleToggleTax}
            paymentDueDate={paymentDueDate}
            purchaseDate={purchaseDate}
            remittanceNumber={remittanceNumber}
            selectedTaxIds={selectedTaxIds}
            supplierId={supplierId}
            suppliers={suppliers}
            taxes={taxes}
          />

          <PurchaseDetailItems
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
          isEditingDetails={isEditingDetails}
          isSaving={updatePurchase.isPending}
          items={items}
          onSave={handleSave}
          selectedTaxes={selectedTaxes}
          successMessage={successMessage}
        />
      </div>
    </div>
  );
}
