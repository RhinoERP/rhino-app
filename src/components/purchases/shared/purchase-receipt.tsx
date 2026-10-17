"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getProductVariantsAction } from "@/modules/inventory/actions/product.actions";
import {
  receivePurchaseAction,
  resumePurchaseReceiptAction,
} from "@/modules/purchases/actions/receive-purchase.action";
import {
  purchaseOrderQueryKey,
  purchasesQueryKey,
} from "@/modules/purchases/queries/query-keys";
import type {
  ProductWithPrice,
  PurchaseOrder,
  PurchaseOrderItem,
} from "@/modules/purchases/service/purchases.service";
import type { LotInput, VariantStockInput } from "@/modules/purchases/types";
import {
  hasUnreceivedPurchaseQuantities,
  hasUnreceivedVariantQuantities,
  remainingVariantStocks,
} from "@/modules/purchases/utils/receipt-progress";
import type {
  ItemTaxInput,
  ItemTaxSource,
} from "@/modules/taxes/item-tax-calculations";
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
  newItem?: boolean;
  product_name?: string;
  received: boolean;
  /** Total ordered quantity in units */
  orderedQuantity: number;
  /** Total ordered unit quantity (kg/lt/mt) */
  orderedUnitQuantity: number;
  unitCost: number;
  unit_of_measure?: string | null;
  weight_per_unit?: number | null;
  has_variants?: boolean;
  variant_stocks?: Record<string, Record<string, number>> | null;
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
      has_variants?: boolean | null;
      tax_override?: ItemTaxInput[] | null;
      item_taxes?: Array<{
        tax_id: string | null;
        name: string;
        rate: number;
        tax_code_snapshot: string | null;
        source: ItemTaxSource;
      }>;
    })[];
    fallback_taxes?: ItemTaxInput[];
    tax_snapshot_initialized?: boolean;
    taxes: Array<{
      tax_id: string | null;
      name: string;
      rate: number;
    }> | null;
  };
  orgSlug: string;
  allTaxes: unknown[];
  receivedProgress: Record<
    string,
    {
      quantity: number;
      unitQuantity: number;
      variantStocks: Record<string, Record<string, number>>;
    }
  >;
  pendingReceipt: { id: string; closePurchase: boolean } | null;
  products: ProductWithPrice[];
  hasSupplierInvoice: boolean;
};

function buildInitialItems(
  purchaseOrder: PurchaseReceiptProps["purchaseOrder"],
  progress: PurchaseReceiptProps["receivedProgress"]
): ReceivedItemForm[] {
  return purchaseOrder.items.map((item) => {
    const pendingVariants = remainingVariantStocks(
      (item.variant_stocks ?? null) as Record<
        string,
        Record<string, number>
      > | null,
      progress[item.id]?.variantStocks
    );
    const remainingQuantity = item.has_variants
      ? Object.values(pendingVariants).reduce(
          (sum, sizes) =>
            sum + Object.values(sizes).reduce((count, qty) => count + qty, 0),
          0
        )
      : Math.max(0, (item.quantity ?? 0) - (progress[item.id]?.quantity ?? 0));
    return {
      itemId: item.id,
      productId: item.product_id,
      product_name: item.product_name,
      received: false,
      orderedQuantity: remainingQuantity,
      orderedUnitQuantity: Math.max(
        0,
        (item.unit_quantity ?? 0) - (progress[item.id]?.unitQuantity ?? 0)
      ),
      unitCost: item.unit_cost ?? 0,
      unit_of_measure: item.unit_of_measure ?? null,
      weight_per_unit: item.weight_per_unit ?? null,
      has_variants: item.has_variants ?? false,
      variant_stocks: pendingVariants,
      lots: item.has_variants
        ? []
        : [
            {
              _key: crypto.randomUUID(),
              lotNumber: "",
              expirationDate: undefined,
              quantity: remainingQuantity,
              unitQuantity: Math.max(
                0,
                (item.unit_quantity ?? 0) -
                  (progress[item.id]?.unitQuantity ?? 0)
              ),
            },
          ],
    };
  });
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
    // Skip lot validation for variant products
    if (item.has_variants) {
      continue;
    }

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

function buildItemLots(item: ReceivedItemForm): LotInput[] {
  return item.lots.map((lot) => ({
    lotNumber: lot.lotNumber,
    expirationDate: lot.expirationDate
      ? lot.expirationDate.toISOString().split("T")[0]
      : "",
    quantity: lot.quantity,
    unitQuantity: lot.unitQuantity,
  }));
}

function buildItemVariantStocks(
  item: ReceivedItemForm,
  variantData: Record<string, VariantProductData>,
  variantStockValues: Record<string, Record<string, Record<string, number>>>
): VariantStockInput[] {
  const productVariants = variantData[item.productId]?.variants ?? {};
  const productStocks = variantStockValues[item.productId] ?? {};
  const variantStocks: VariantStockInput[] = [];

  for (const [color, sizes] of Object.entries(productStocks)) {
    for (const [size, quantity] of Object.entries(sizes)) {
      if (quantity > 0) {
        const variantId = productVariants[color]?.[size];
        if (variantId) {
          variantStocks.push({ variantId, talle: size, color, quantity });
        }
      }
    }
  }

  return variantStocks;
}

function buildActionInput(input: {
  orgSlug: string;
  purchaseOrderId: string;
  receiptId: string;
  closePurchase: boolean;
  itemsToReceive: ReceivedItemForm[];
  variantData: Record<string, VariantProductData>;
  variantStockValues: Record<string, Record<string, Record<string, number>>>;
}) {
  const {
    orgSlug,
    purchaseOrderId,
    receiptId,
    closePurchase,
    itemsToReceive,
    variantData,
    variantStockValues,
  } = input;

  return {
    orgSlug,
    purchaseOrderId,
    receiptId,
    closePurchase,
    receivedItems: itemsToReceive.map((item) => {
      const base = {
        itemId: item.itemId,
        productId: item.productId,
        newItem: item.newItem ?? false,
        received: true as const,
        unitCost: item.unitCost,
      };

      return item.has_variants
        ? {
            ...base,
            lots: [],
            variantStocks: buildItemVariantStocks(
              item,
              variantData,
              variantStockValues
            ),
          }
        : { ...base, lots: buildItemLots(item) };
    }),
  };
}

export type VariantProductData = {
  talles: string[];
  colores: string[];
  variants: Record<string, Record<string, string>>; // [color][talle] → variantId
};

export type VariantChangeDetail = {
  color: string;
  talle: string;
  originalQty: number;
  modifiedQty: number;
};

export type ModifiedItemDisplay = {
  productName: string;
  orderedQty: number;
  orderedUnitQty: number;
  modifiedQty: number;
  modifiedUnitQty: number;
  unit_of_measure?: string | null;
  isWeightBased: boolean;
  variantChanges?: VariantChangeDetail[];
};

function hasWeightOrVolumeMeasure(unitOfMeasure?: string | null): boolean {
  if (!unitOfMeasure) {
    return false;
  }
  const normalized = unitOfMeasure.toUpperCase();
  return normalized === "KG" || normalized === "LT" || normalized === "MT";
}

function computeVariantModifications(
  item: ReceivedItemForm,
  currentStocks: Record<string, Record<string, number>>
) {
  const originalStocks = item.variant_stocks ?? {};

  const totalModified = Object.values(currentStocks).reduce(
    (sum, sizes) => sum + Object.values(sizes).reduce((s, q) => s + q, 0),
    0
  );

  const variantChanges: VariantChangeDetail[] = [];

  const allColors = [
    ...new Set([...Object.keys(originalStocks), ...Object.keys(currentStocks)]),
  ];

  for (const color of allColors) {
    const originalSizes = originalStocks[color] ?? {};
    const currentSizes = currentStocks[color] ?? {};
    const allSizes = [
      ...new Set([...Object.keys(originalSizes), ...Object.keys(currentSizes)]),
    ];

    for (const size of allSizes) {
      const originalQty = originalSizes[size] ?? 0;
      const modifiedQty = currentSizes[size] ?? 0;
      if (originalQty !== modifiedQty) {
        variantChanges.push({ color, talle: size, originalQty, modifiedQty });
      }
    }
  }

  return {
    productName: item.product_name ?? item.productId,
    orderedQty: item.orderedQuantity,
    orderedUnitQty: item.orderedUnitQuantity,
    modifiedQty: totalModified,
    modifiedUnitQty: totalModified,
    unit_of_measure: item.unit_of_measure,
    isWeightBased: false,
    variantChanges: variantChanges.length > 0 ? variantChanges : undefined,
  };
}

function computeModifications(
  items: ReceivedItemForm[],
  variantStockValues: Record<string, Record<string, Record<string, number>>>
): ModifiedItemDisplay[] {
  return items
    .filter((item) => item.received)
    .map((item) => {
      if (item.has_variants) {
        const currentStocks = variantStockValues[item.productId] ?? {};
        return computeVariantModifications(item, currentStocks);
      }

      const assignedQty = item.lots.reduce(
        (sum, lot) => sum + (Number(lot.quantity) || 0),
        0
      );
      const assignedUnitQty = item.lots.reduce(
        (sum, lot) => sum + (Number(lot.unitQuantity) || 0),
        0
      );

      return {
        productName: item.product_name ?? item.productId,
        orderedQty: item.orderedQuantity,
        orderedUnitQty: item.orderedUnitQuantity,
        modifiedQty: assignedQty,
        modifiedUnitQty: assignedUnitQty,
        unit_of_measure: item.unit_of_measure,
        isWeightBased: hasWeightOrVolumeMeasure(item.unit_of_measure),
      };
    });
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: receipt form orchestrates lots, variants, and the additional-product section.
export function PurchaseReceipt({
  purchaseOrder,
  orgSlug,
  receivedProgress,
  pendingReceipt,
  products,
  hasSupplierInvoice,
}: PurchaseReceiptProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm<ReceiptFormValues>({
    defaultValues: {
      items: buildInitialItems(purchaseOrder, receivedProgress),
    },
  });

  const { fields: itemFields, append: appendItem } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const { formState } = form;
  const isReceiving = formState.isSubmitting;
  const [error, setError] = useState<string | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [modifiedItems, setModifiedItems] = useState<ModifiedItemDisplay[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [newProductId, setNewProductId] = useState("");
  const [hasPending, setHasPending] = useState(false);
  const receiptIdRef = useRef<string | null>(null);

  const [variantData, setVariantData] = useState<
    Record<string, VariantProductData>
  >({});
  const [variantStockValues, setVariantStockValues] = useState<
    Record<string, Record<string, Record<string, number>>>
  >({});
  const loadingVariantsRef = useRef<Set<string>>(new Set());

  const loadVariantData = useCallback(
    async (
      productId: string,
      prefilledStocks?: Record<string, Record<string, number>> | null
    ) => {
      if (loadingVariantsRef.current.has(productId)) {
        return;
      }
      loadingVariantsRef.current.add(productId);

      try {
        const variants = await getProductVariantsAction(orgSlug, productId);

        const sizes = [...new Set(variants.map((v) => v.talle))].sort();
        const colors = [...new Set(variants.map((v) => v.color))].sort();

        const variantsMap: Record<string, Record<string, string>> = {};
        const stocks: Record<string, Record<string, number>> = {};

        for (const color of colors) {
          variantsMap[color] = {};
          stocks[color] = {};
          for (const size of sizes) {
            const variant = variants.find(
              (v) => v.color === color && v.talle === size
            );
            variantsMap[color][size] = variant?.id ?? "";
            stocks[color][size] = prefilledStocks?.[color]?.[size] ?? 0;
          }
        }

        setVariantData((prev) => ({
          ...prev,
          [productId]: {
            talles: sizes,
            colores: colors,
            variants: variantsMap,
          },
        }));
        setVariantStockValues((prev) => ({ ...prev, [productId]: stocks }));
      } catch {
        loadingVariantsRef.current.delete(productId);
        setVariantData((prev) => ({
          ...prev,
          [productId]: { talles: [], colores: [], variants: {} },
        }));
        setVariantStockValues((prev) => ({ ...prev, [productId]: {} }));
      }
    },
    [orgSlug]
  );

  const handleVariantStockChange = useCallback(
    (productId: string, color: string, talle: string, value: number) => {
      setVariantStockValues((prev) => {
        const product = prev[productId];
        const colorSizes = product?.[color];
        // Skip update if value hasn't changed
        if (colorSizes?.[talle] === value) {
          return prev;
        }
        return {
          ...prev,
          [productId]: {
            ...product,
            [color]: { ...colorSizes, [talle]: value },
          },
        };
      });
    },
    []
  );

  const items = form.watch("items");

  const addReceivedProduct = () => {
    const product = products.find((candidate) => candidate.id === newProductId);
    if (!product?.id || items.some((item) => item.productId === product.id)) {
      setError("Seleccioná un producto que todavía no figure en la compra");
      return;
    }
    appendItem({
      itemId: crypto.randomUUID(),
      productId: product.id,
      newItem: true,
      product_name: product.name ?? product.id,
      received: true,
      orderedQuantity: 0,
      orderedUnitQuantity: 0,
      unitCost: product.cost_price ?? 0,
      unit_of_measure: product.unit_of_measure,
      has_variants: product.has_variants,
      variant_stocks: product.has_variants ? {} : null,
      lots: product.has_variants
        ? []
        : [
            {
              _key: crypto.randomUUID(),
              lotNumber: "",
              expirationDate: undefined,
              quantity: 1,
              unitQuantity: 1,
            },
          ],
    });
    setNewProductId("");
    setError(null);
  };

  const handleToggleAll = (checked: boolean) => {
    for (const [index] of items.entries()) {
      form.setValue(`items.${index}.received`, checked);
    }
  };

  const submitReceive = async (
    itemsToReceive: ReceivedItemForm[],
    closePurchase: boolean
  ) => {
    const validationError = validateLots(itemsToReceive);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!receiptIdRef.current) {
      receiptIdRef.current = crypto.randomUUID();
    }
    const result = await receivePurchaseAction(
      buildActionInput({
        orgSlug,
        purchaseOrderId: purchaseOrder.id,
        receiptId: receiptIdRef.current,
        closePurchase,
        itemsToReceive,
        variantData,
        variantStockValues,
      })
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
  };

  const handleReceive = form.handleSubmit(async (values) => {
    if (pendingReceipt) {
      setError("Finalizá la entrega pendiente antes de registrar otra");
      return;
    }
    setError(null);

    const itemsToReceive = values.items.filter((item) => item.received);

    if (itemsToReceive.length === 0) {
      setError("Debe marcar al menos un producto como recibido");
      return;
    }

    const modifications = computeModifications(
      itemsToReceive,
      variantStockValues
    );
    const hasModifications = modifications.some(
      (m) =>
        m.modifiedQty !== m.orderedQty ||
        m.modifiedUnitQty !== m.orderedUnitQty ||
        (m.variantChanges?.length ?? 0) > 0
    );

    const unselected = values.items.filter(
      (item) =>
        !item.received &&
        (item.orderedQuantity > 0 || item.orderedUnitQuantity > 0)
    );
    const leavesPending =
      hasUnreceivedPurchaseQuantities(values.items, modifications) ||
      values.items.some(
        (item) =>
          item.received &&
          item.has_variants &&
          hasUnreceivedVariantQuantities(
            item.variant_stocks ?? null,
            variantStockValues[item.productId] ?? {}
          )
      );
    if (hasModifications || leavesPending) {
      setHasPending(leavesPending);
      setModifiedItems([
        ...modifications,
        ...unselected.map((item) => ({
          productName: item.product_name ?? item.productId,
          orderedQty: item.orderedQuantity,
          orderedUnitQty: item.orderedUnitQuantity,
          modifiedQty: 0,
          modifiedUnitQty: 0,
          unit_of_measure: item.unit_of_measure,
          isWeightBased: hasWeightOrVolumeMeasure(item.unit_of_measure),
        })),
      ]);
      setConfirmModalOpen(true);
      return;
    }

    await submitReceive(itemsToReceive, true);
  });

  const handleConfirmReceive = async (closePurchase: boolean) => {
    setIsConfirming(true);
    setError(null);

    const values = form.getValues();
    const itemsToReceive = values.items.filter((item) => item.received);
    await submitReceive(itemsToReceive, closePurchase);

    setIsConfirming(false);
    setConfirmModalOpen(false);
  };

  const receivedCount = items.filter((item) => item.received).length;
  const totalItems = items.length;
  const allSelected = totalItems > 0 && receivedCount === totalItems;
  const handleResumeReceipt = async () => {
    if (!pendingReceipt) {
      return;
    }
    setIsResuming(true);
    setError(null);
    try {
      const result = await resumePurchaseReceiptAction({
        orgSlug,
        purchaseOrderId: purchaseOrder.id,
        receiptId: pendingReceipt.id,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
      if (pendingReceipt.closePurchase) {
        router.push(`/org/${orgSlug}/compras/${purchaseOrder.id}`);
      }
    } finally {
      setIsResuming(false);
    }
  };
  let confirmLabel = "Confirmar recepción";
  if (isConfirming) {
    confirmLabel = "Procesando...";
  } else if (hasPending) {
    confirmLabel = "Recibir y cerrar con faltante";
  }

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
      {pendingReceipt && (
        <div className="flex items-center justify-between gap-4 rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="text-amber-900 text-sm">
            Hay una entrega registrada pendiente de sincronizar. No vuelvas a
            ingresarla al stock.
          </p>
          <Button
            disabled={isResuming}
            onClick={handleResumeReceipt}
            type="button"
          >
            {isResuming ? "Finalizando..." : "Finalizar entrega pendiente"}
          </Button>
        </div>
      )}

      {!pendingReceipt && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
          <label htmlFor="extra-received-product">
            Producto adicional recibido
          </label>
          <select
            className="min-w-48 rounded-md border bg-background px-3 py-2 text-sm"
            id="extra-received-product"
            onChange={(event) => setNewProductId(event.target.value)}
            value={newProductId}
          >
            <option value="">Seleccionar producto</option>
            {products
              .filter(
                (product) =>
                  product.id &&
                  !items.some((item) => item.productId === product.id)
              )
              .map((product) => (
                <option key={product.id} value={product.id ?? ""}>
                  {product.name}
                </option>
              ))}
          </select>
          <Button
            disabled={!newProductId}
            onClick={addReceivedProduct}
            type="button"
            variant="outline"
          >
            Agregar a recepción
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-6">
          <PurchaseReceiptItems
            allSelected={allSelected}
            control={form.control}
            currency={purchaseOrder.currency ?? "ARS"}
            isProcessing={isReceiving}
            itemFields={itemFields}
            onLoadVariantData={loadVariantData}
            onProcessSelected={handleReceive}
            onToggleAll={handleToggleAll}
            onVariantStockChange={handleVariantStockChange}
            selectedCount={receivedCount}
            variantData={variantData}
            variantStockValues={variantStockValues}
            watch={form.watch}
          />
        </div>

        <PurchaseReceiptSummary
          currency={purchaseOrder.currency ?? "ARS"}
          error={error}
          fallbackTaxes={purchaseOrder.fallback_taxes ?? []}
          globalDiscountPercentage={purchaseOrder.global_discount_percentage}
          hasItemTaxSnapshots={purchaseOrder.tax_snapshot_initialized ?? false}
          isReceiving={isReceiving}
          items={items}
          itemTaxSelections={
            new Map(
              purchaseOrder.items.map((item) => [
                item.id,
                item.tax_override ??
                  (item.item_taxes ?? [])
                    .filter((tax) => tax.source !== "fallback")
                    .map((tax) => ({
                      taxId: tax.tax_id ?? "",
                      name: tax.name,
                      rate: tax.rate,
                      taxCodeSnapshot: tax.tax_code_snapshot,
                      source: tax.source,
                    })),
              ])
            )
          }
          onReceive={handleReceive}
          receivedCount={receivedCount}
          taxes={purchaseOrder.taxes || []}
          totalItems={totalItems}
          variantStockValues={variantStockValues}
        />
      </div>

      <Dialog onOpenChange={setConfirmModalOpen} open={confirmModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Confirmar recepción</DialogTitle>
            <DialogDescription>
              {hasPending
                ? "Quedan productos pendientes. Podés esperar otra entrega o cerrar la compra con faltante."
                : "¿Confirmás la recepción con las siguientes cantidades?"}
            </DialogDescription>
            {hasSupplierInvoice &&
              modifiedItems.some(
                (item) =>
                  item.modifiedQty !== item.orderedQty ||
                  item.variantChanges?.length
              ) && (
                <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm">
                  Pedido ya facturado: las cantidades no coinciden. La factura
                  prevalece para la cuenta por pagar.
                </p>
              )}
          </DialogHeader>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Producto</th>
                  <th className="pr-4 pb-2 text-right font-medium">
                    Pendiente previo
                  </th>
                  <th className="pb-2 text-right font-medium">
                    Pedido Recibido
                  </th>
                </tr>
              </thead>
              <tbody>
                {modifiedItems.map((item) => {
                  const hasChanges =
                    item.modifiedQty !== item.orderedQty ||
                    item.modifiedUnitQty !== item.orderedUnitQty;

                  const formatQty = (qty: number) =>
                    item.isWeightBased
                      ? qty.toLocaleString("es-AR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      : qty.toLocaleString("es-AR");

                  const unitLabel = (() => {
                    if (!item.unit_of_measure) {
                      return "un";
                    }
                    const n = item.unit_of_measure.toUpperCase();
                    if (n === "KG") {
                      return "kg";
                    }
                    if (n === "LT") {
                      return "lt";
                    }
                    if (n === "MT") {
                      return "t";
                    }
                    return "un";
                  })();

                  return (
                    <Fragment key={item.productName}>
                      <tr className="border-b last:border-0">
                        <td className="py-3 pr-4 font-medium">
                          {item.productName}
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums">
                          {item.isWeightBased
                            ? `${formatQty(item.orderedUnitQty)} ${unitLabel}`
                            : `${formatQty(item.orderedQty)} un`}
                        </td>
                        <td
                          className={`py-3 text-right tabular-nums ${hasChanges ? "font-semibold text-amber-700" : ""}`}
                        >
                          {item.isWeightBased
                            ? `${formatQty(item.modifiedUnitQty)} ${unitLabel}`
                            : `${formatQty(item.modifiedQty)} un`}
                        </td>
                      </tr>

                      {item.variantChanges?.map((vc) => (
                        <tr
                          className="border-b last:border-0"
                          key={`${vc.color}-${vc.talle}`}
                        >
                          <td className="py-1.5 pr-4 pl-6 text-muted-foreground text-xs">
                            {vc.color} / {vc.talle}
                          </td>
                          <td className="py-1.5 pr-4 text-right text-muted-foreground text-xs tabular-nums">
                            {vc.originalQty} un
                          </td>
                          <td className="py-1.5 text-right font-semibold text-amber-700 text-xs tabular-nums">
                            {vc.modifiedQty} un
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <DialogFooter>
            <Button
              onClick={() => setConfirmModalOpen(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            {hasPending && (
              <Button
                disabled={isConfirming}
                onClick={() => handleConfirmReceive(false)}
                type="button"
              >
                Recibir y esperar el resto
              </Button>
            )}
            <Button
              disabled={isConfirming}
              onClick={() => handleConfirmReceive(true)}
              type="button"
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
