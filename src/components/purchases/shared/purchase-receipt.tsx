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
import { receivePurchaseAction } from "@/modules/purchases/actions/receive-purchase.action";
import {
  purchaseOrderQueryKey,
  purchasesQueryKey,
} from "@/modules/purchases/queries/query-keys";
import type {
  PurchaseOrder,
  PurchaseOrderItem,
} from "@/modules/purchases/service/purchases.service";
import type { LotInput, VariantStockInput } from "@/modules/purchases/types";
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
      variant_stocks?: Record<string, Record<string, number>> | null;
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
    has_variants: item.has_variants ?? false,
    variant_stocks: item.variant_stocks ?? null,
    lots: item.has_variants
      ? []
      : [
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
  itemsToReceive: ReceivedItemForm[];
  variantData: Record<string, VariantProductData>;
  variantStockValues: Record<string, Record<string, Record<string, number>>>;
}) {
  const {
    orgSlug,
    purchaseOrderId,
    itemsToReceive,
    variantData,
    variantStockValues,
  } = input;

  return {
    orgSlug,
    purchaseOrderId,
    receivedItems: itemsToReceive.map((item) => {
      const base = {
        itemId: item.itemId,
        productId: item.productId,
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
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [modifiedItems, setModifiedItems] = useState<ModifiedItemDisplay[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);

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

  const handleToggleAll = (checked: boolean) => {
    for (const [index] of items.entries()) {
      form.setValue(`items.${index}.received`, checked);
    }
  };

  const submitReceive = async (itemsToReceive: ReceivedItemForm[]) => {
    const validationError = validateLots(itemsToReceive);
    if (validationError) {
      setError(validationError);
      return;
    }

    const result = await receivePurchaseAction(
      buildActionInput({
        orgSlug,
        purchaseOrderId: purchaseOrder.id,
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
        m.modifiedQty !== m.orderedQty || m.modifiedUnitQty !== m.orderedUnitQty
    );

    if (hasModifications) {
      setModifiedItems(modifications);
      setConfirmModalOpen(true);
      return;
    }

    await submitReceive(itemsToReceive);
  });

  const handleConfirmReceive = async () => {
    setIsConfirming(true);
    setError(null);

    const values = form.getValues();
    const itemsToReceive = values.items.filter((item) => item.received);
    await submitReceive(itemsToReceive);

    setIsConfirming(false);
    setConfirmModalOpen(false);
  };

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
          error={error}
          globalDiscountPercentage={purchaseOrder.global_discount_percentage}
          isReceiving={isReceiving}
          items={items}
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
              ¿Está seguro que quiere marcar el pedido como recibido con las
              siguientes modificaciones?
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Producto</th>
                  <th className="pr-4 pb-2 text-right font-medium">
                    Pedido original
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
            <Button
              disabled={isConfirming}
              onClick={handleConfirmReceive}
              type="button"
            >
              {isConfirming ? "Procesando..." : "Confirmar y recibir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
