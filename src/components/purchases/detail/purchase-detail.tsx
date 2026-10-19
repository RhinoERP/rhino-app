"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useVariantLoader } from "@/hooks/use-variant-loader";
import type { Category } from "@/modules/categories/types";
import { confirmDraftPurchaseAction } from "@/modules/purchases/actions/confirm-draft-purchase.action";
import { useProductTaxes } from "@/modules/purchases/hooks/use-product-taxes";
import { useUpdatePurchaseOrder } from "@/modules/purchases/hooks/use-update-purchase-order";
import { useUpdatePurchaseStatus } from "@/modules/purchases/hooks/use-update-purchase-status";
import type {
  ProductWithPrice,
  PurchaseOrder,
  PurchaseOrderItem,
} from "@/modules/purchases/service/purchases.service";
import {
  purchaseVariantAllocationChanged,
  sumPurchaseVariantStocks,
} from "@/modules/purchases/utils/purchase-item-variants";
import { getPurchaseUnitShortLabel } from "@/modules/purchases/utils/purchase-units";
import type { Supplier } from "@/modules/suppliers/service/suppliers.service";
import type {
  ItemTaxInput,
  ItemTaxSnapshot,
  ItemTaxSource,
} from "@/modules/taxes/item-tax-calculations";
import { toFallbackItemTaxes } from "@/modules/taxes/item-tax-calculations";
import type { Tax } from "@/modules/taxes/types";
import { VariantBreakdown } from "../shared/variant-breakdown";
import { PurchaseDetailForm } from "./purchase-detail-form";
import {
  PurchaseDetailHeader,
  PurchaseStatusBadge,
} from "./purchase-detail-header";
import type { PurchaseDetailItem } from "./purchase-detail-items";
import { PurchaseDetailItems } from "./purchase-detail-items";
import { PurchaseDetailSummary } from "./purchase-detail-summary";

type PurchaseOrderWithItems = Omit<PurchaseOrder, "fallback_taxes"> & {
  items: (PurchaseOrderItem & {
    product_name?: string;
    weight_per_unit?: number | null;
    unit_of_measure?: string | null;
    total_weight_kg?: number | null;
    has_variants?: boolean;
    tax_override?: ItemTaxInput[] | null;
    item_taxes?: Array<{
      tax_id: string | null;
      name: string;
      rate: number;
      base_amount: number;
      tax_amount: number;
      tax_code_snapshot: string | null;
      source: ItemTaxSource;
    }>;
  })[];
  fallback_taxes: ItemTaxInput[];
  tax_snapshot_initialized?: boolean;
  fiscal_data_invalid?: boolean;
  taxes: Array<{
    tax_id: string | null;
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
  taxes: Tax[];
  receivedProgress: Record<string, { quantity: number }>;
  receiptHistory: Array<{
    id: string;
    receivedAt: string;
    closePurchase: boolean;
    itemCount: number;
    items: Array<{
      purchaseOrderItemId: string;
      productId: string;
      productName: string;
      unitOfMeasure: string | null;
      isExtra: boolean;
      quantity: number;
      unitQuantity: number;
      variantStocks: Record<string, Record<string, number>>;
    }>;
  }>;
  invoiceMismatch: boolean;
};

function toDateOnlyString(date: Date): string {
  return date.toISOString().split("T")[0] ?? "";
}

function formatReceiptQuantity(line: {
  quantity: number;
  unitQuantity: number;
  unitOfMeasure: string | null;
}): string {
  const value = line.unitQuantity > 0 ? line.unitQuantity : line.quantity;
  return `${value.toLocaleString("es-AR", { maximumFractionDigits: 2 })} ${getPurchaseUnitShortLabel(line.unitOfMeasure)}`;
}

function validatePurchaseSave(params: {
  fiscalDataInvalid: boolean;
  supplierId: string;
  itemCount: number;
}): string | null {
  if (params.fiscalDataInvalid) {
    return "Los impuestos guardados deben repararse antes de editar la compra";
  }
  if (!params.supplierId) {
    return "Debe seleccionar un proveedor";
  }
  if (params.itemCount === 0) {
    return "Debe agregar al menos un producto";
  }
  return null;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: maps existing purchase units, variants and persisted fiscal snapshots in one pass.
function mapPurchaseOrderItemToDetailItem(
  item: PurchaseOrderWithItems["items"][number],
  hasSnapshots: boolean
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
  let savedTaxes: ItemTaxInput[] | undefined = hasSnapshots ? [] : undefined;
  if (item.item_taxes?.length) {
    savedTaxes = item.item_taxes
      .filter((tax) => tax.source !== "fallback")
      .map((tax) => ({
        taxId: tax.tax_id ?? "",
        name: tax.name,
        rate: tax.rate,
        taxCodeSnapshot: tax.tax_code_snapshot,
        source: tax.source,
      }));
  }

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
    taxes: item.tax_override ?? savedTaxes,
    persistedTaxes: item.item_taxes?.map(
      (tax): ItemTaxSnapshot => ({
        lineId: item.id,
        productId: item.product_id,
        taxId: tax.tax_id,
        name: tax.name,
        rate: tax.rate,
        baseAmount: tax.base_amount,
        taxAmount: tax.tax_amount,
        taxCodeSnapshot: tax.tax_code_snapshot,
        source: tax.source,
      })
    ),
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: purchase editor coordinates legacy conversion, saved tax selections and status transitions.
export function PurchaseDetail({
  orgSlug,
  purchaseOrder,
  relatedOrder,
  suppliers,
  products,
  categories = [],
  taxes,
  receivedProgress,
  receiptHistory,
  invoiceMismatch,
}: PurchaseDetailProps) {
  const router = useRouter();
  const updatePurchase = useUpdatePurchaseOrder(orgSlug);
  const updateStatus = useUpdatePurchaseStatus(orgSlug);
  const { data: productTaxes = new Map(), isSuccess: productTaxesReady } =
    useProductTaxes(
      orgSlug,
      purchaseOrder.items.map((item) => item.product_id)
    );

  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [awaitingSavedAt, setAwaitingSavedAt] = useState<string | null>(null);
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
    purchaseOrder.items.map((item) =>
      mapPurchaseOrderItemToDetailItem(
        item,
        purchaseOrder.tax_snapshot_initialized ?? false
      )
    )
  );
  const { variantMetaMap } = useVariantLoader(orgSlug, items);
  useEffect(() => {
    if (!isEditingDetails) {
      setItems(
        purchaseOrder.items.map((item) =>
          mapPurchaseOrderItemToDetailItem(
            item,
            purchaseOrder.tax_snapshot_initialized ?? false
          )
        )
      );
    }
  }, [
    isEditingDetails,
    purchaseOrder.items,
    purchaseOrder.tax_snapshot_initialized,
  ]);
  const [isConfirmingDraft, setIsConfirmingDraft] = useState(false);
  const isDraftSale = purchaseOrder.status === "DRAFT";
  const isLegacy = !(purchaseOrder.tax_snapshot_initialized || isDraftSale);
  const [convertLegacyTaxes, setConvertLegacyTaxes] = useState(false);
  useEffect(() => {
    if (awaitingSavedAt && purchaseOrder.updated_at === awaitingSavedAt) {
      setIsEditingDetails(false);
      setConvertLegacyTaxes(false);
      setAwaitingSavedAt(null);
    }
  }, [awaitingSavedAt, purchaseOrder.updated_at]);
  const canEditFiscal = isEditingDetails && (!isLegacy || convertLegacyTaxes);
  const [error, setError] = useState<string | null>(
    purchaseOrder.fiscal_data_invalid
      ? "Los impuestos guardados tienen un formato inválido. La compra no puede recalcularse hasta repararlos."
      : null
  );
  const [selectedTaxIds, setSelectedTaxIds] = useState<string[]>(() =>
    (purchaseOrder.fallback_taxes ?? []).map(
      (tax, index) => tax.taxId || `deleted-${index}`
    )
  );
  useEffect(() => {
    if (!isEditingDetails) {
      setSelectedTaxIds(
        (purchaseOrder.fallback_taxes ?? []).map(
          (tax, index) => tax.taxId || `deleted-${index}`
        )
      );
    }
  }, [isEditingDetails, purchaseOrder.fallback_taxes]);

  const selectedTaxes = useMemo(
    () =>
      selectedTaxIds.flatMap((id) => {
        const saved = (purchaseOrder.fallback_taxes ?? []).find(
          (tax, index) => (tax.taxId || `deleted-${index}`) === id
        );
        const active = taxes.find((tax) => tax.id === id);
        if (saved) {
          return [{ ...saved }];
        }
        return active
          ? [
              {
                taxId: active.id,
                name: active.name,
                rate: active.rate,
                taxCodeSnapshot: active.code,
              },
            ]
          : [];
      }),
    [taxes, selectedTaxIds, purchaseOrder.fallback_taxes]
  );

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
      taxes: item.taxes,
    })),
    global_discount_percentage: globalDiscountPercentage,
    taxes: selectedTaxes,
    convertLegacyTaxes,
  });

  const findIncompleteVariantItem = (checkAll: boolean) =>
    items.find((item) => {
      if (
        !(
          item.has_variants ||
          products.some((p) => p.id === item.product_id && p.has_variants)
        )
      ) {
        return false;
      }
      const saved = purchaseOrder.items.find(
        (original) => original.id === item.id
      );
      const changed = purchaseVariantAllocationChanged(item, saved);
      return (
        (checkAll || changed) &&
        (sumPurchaseVariantStocks(item.variant_stocks) !== item.quantity ||
          !Number.isSafeInteger(item.quantity) ||
          item.quantity <= 0)
      );
    });

  const handleSave = async () => {
    const validationError = validatePurchaseSave({
      fiscalDataInvalid: purchaseOrder.fiscal_data_invalid ?? false,
      supplierId,
      itemCount: items.length,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    const incompleteVariant = findIncompleteVariantItem(false);
    if (incompleteVariant) {
      setError(
        `Asigná todas las unidades de ${incompleteVariant.product_name} por talle y color antes de guardar`
      );
      return;
    }

    setError(null);

    try {
      const result = await updatePurchase.mutateAsync(buildSavePayload());

      if (result.success && result.data?.updated_at) {
        setAwaitingSavedAt(result.data.updated_at);
        router.refresh();
      } else if (result.success) {
        setError(
          "La compra se guardó, pero no se pudo actualizar el detalle. Recargá la página."
        );
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

    const incompleteVariant = findIncompleteVariantItem(true);
    if (incompleteVariant) {
      setError(
        `Asigná todas las unidades de ${incompleteVariant.product_name} por talle y color antes de confirmar`
      );
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
        onEditToggle={() => {
          if (!awaitingSavedAt) {
            setIsEditingDetails((prev) => !prev);
          }
        }}
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

      {invoiceMismatch && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm">
          Pedido ya facturado: las cantidades no coinciden. La factura prevalece
          para la cuenta por pagar.
        </p>
      )}
      {receiptHistory.length > 0 && (
        <div className="rounded-lg border px-4 py-3">
          <p className="font-medium">Entregas recibidas</p>
          <ul className="mt-2 space-y-1 text-sm">
            {receiptHistory.map((receipt) => (
              <li key={receipt.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-muted [&::-webkit-details-marker]:hidden">
                    <span>
                      {new Date(receipt.receivedAt).toLocaleDateString("es-AR")}
                      : {receipt.itemCount}{" "}
                      {receipt.itemCount === 1 ? "producto" : "productos"} ·{" "}
                      {receipt.closePurchase
                        ? "Cierre de compra"
                        : "Compra abierta"}
                    </span>
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  {receipt.items.length > 0 ? (
                    <div className="mt-1 overflow-x-auto rounded-md border">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 text-muted-foreground">
                          <tr>
                            <th className="px-2 py-1 text-left font-medium">
                              Producto
                            </th>
                            <th className="px-2 py-1 text-left font-medium">
                              Variantes
                            </th>
                            <th className="px-2 py-1 text-right font-medium">
                              Cantidad
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {receipt.items.map((line) => (
                            <tr
                              className="border-t"
                              key={line.purchaseOrderItemId}
                            >
                              <td className="px-2 py-1">
                                <span>{line.productName}</span>
                                {line.isExtra ? (
                                  <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 font-medium text-[10px] text-amber-800">
                                    No pedido
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-2 py-1">
                                {sumPurchaseVariantStocks(line.variantStocks) >
                                0 ? (
                                  <VariantBreakdown
                                    variantStocks={line.variantStocks}
                                  />
                                ) : (
                                  <span className="text-muted-foreground">
                                    —
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1 text-right">
                                {formatReceiptQuantity(line)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="px-2 py-1 text-muted-foreground text-xs">
                      Sin detalle de productos
                    </p>
                  )}
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row">
        <div
          className={`flex-1 space-y-6 ${awaitingSavedAt ? "pointer-events-none opacity-70" : ""}`}
        >
          <PurchaseDetailForm
            expirationDays={expirationDays}
            frozenTaxes={purchaseOrder.fallback_taxes ?? []}
            globalDiscountPercentage={globalDiscountPercentage}
            hasLegacyTaxes={isLegacy && !convertLegacyTaxes}
            isEditingDetails={isEditingDetails}
            isEditingFiscal={canEditFiscal}
            isSupplierPickerOpen={isSupplierPickerOpen}
            onExpirationDaysChange={setExpirationDays}
            onGlobalDiscountPercentageChange={setGlobalDiscountPercentage}
            onPurchaseDateChange={setPurchaseDate}
            onRemittanceNumberChange={setRemittanceNumber}
            onSupplierChange={setSupplierId}
            onSupplierPickerOpenChange={setIsSupplierPickerOpen}
            onTaxesChange={setSelectedTaxIds}
            purchaseDate={purchaseDate}
            remittanceNumber={remittanceNumber}
            selectedTaxIds={selectedTaxIds}
            supplierId={supplierId}
            suppliers={suppliers}
            taxes={taxes}
          />

          {isEditingDetails && isLegacy && !convertLegacyTaxes && (
            <Button
              disabled={!productTaxesReady}
              onClick={() => {
                setItems((current) =>
                  current.map((item) => ({
                    ...item,
                    taxes:
                      item.taxes ?? productTaxes.get(item.product_id) ?? [],
                  }))
                );
                setConvertLegacyTaxes(true);
              }}
              type="button"
              variant="outline"
            >
              Convertir impuestos históricos para editar productos e importes
            </Button>
          )}
          <PurchaseDetailItems
            categories={categories}
            currency={purchaseOrder.currency ?? "ARS"}
            fallbackTaxes={toFallbackItemTaxes(selectedTaxes)}
            globalDiscountPercent={globalDiscountPercentage}
            hasItemTaxSnapshots={
              purchaseOrder.tax_snapshot_initialized ?? false
            }
            isEditingDetails={canEditFiscal}
            items={items}
            onError={setError}
            onItemsChange={setItems}
            products={products}
            productTaxes={productTaxes}
            receivedProgress={receivedProgress}
            supplierId={supplierId}
            taxes={taxes}
            variantMetaMap={variantMetaMap}
          />
        </div>

        <PurchaseDetailSummary
          currency={purchaseOrder.currency ?? "ARS"}
          error={error}
          fallbackTaxes={toFallbackItemTaxes(selectedTaxes)}
          globalDiscountPercentage={
            isEditingDetails
              ? globalDiscountPercentage
              : (purchaseOrder.global_discount_percentage ?? null)
          }
          isConfirmingDraft={isConfirmingDraft}
          isDraftSale={isDraftSale}
          isEditingDetails={isEditingDetails}
          isSaving={updatePurchase.isPending || Boolean(awaitingSavedAt)}
          items={items}
          onConfirmDraft={handleConfirmDraft}
          onSave={handleSave}
          previewItemTaxes={canEditFiscal}
          productTaxes={productTaxes}
          purchaseOrderTaxes={purchaseOrder.taxes}
          supplierId={supplierId}
        />
      </div>
    </div>
  );
}
