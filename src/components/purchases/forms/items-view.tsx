"use client";

import { TrashIcon } from "@phosphor-icons/react";
import { VariantStockMatrix } from "@/components/products/variant-stock-matrix";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PurchaseItem } from "@/hooks/use-purchase-form";
import type { VariantMeta } from "@/hooks/use-variant-loader";
import { formatCurrency } from "@/lib/format";
import type { ProductWithPrice } from "@/modules/purchases/service/purchases.service";

function isWeightOrVolumeUnit(unit: string): boolean {
  return unit === "KG" || unit === "LT" || unit === "MT";
}

function parseInputValue(
  e: React.ChangeEvent<HTMLInputElement>
): number | null {
  const value = Number.parseFloat(e.target.value);
  if (!Number.isNaN(value)) {
    return value;
  }
  if (e.target.value === "") {
    return 0;
  }
  return null;
}

function getUnitOfMeasure(itemUnit: string | null | undefined): string {
  return itemUnit || "UN";
}

function getUnitLabelName(unitOfMeasure: string): string {
  const labels: Record<string, string> = {
    UN: "unidad",
    KG: "kg",
    LT: "lt",
    MT: "m",
  };
  return labels[unitOfMeasure] || unitOfMeasure;
}

function getEmptyOrValue(value: number | null | undefined): number | "" {
  if (!value || Number.isNaN(value)) {
    return "";
  }
  return value;
}

function formatMeasureValue(value: number, unitLabel: string): string {
  return `${value.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${unitLabel}`;
}

function VariantItemCard({
  item,
  index,
  product,
  variantMeta,
  onRemoveItem,
  onUpdateUnitCost,
  onVariantStockChange,
  onUpdateDiscount,
}: {
  item: PurchaseItem;
  index: number;
  product: ProductWithPrice | undefined;
  variantMeta: VariantMeta | undefined;
  onRemoveItem: (index: number) => void;
  onUpdateUnitCost: (index: number, cost: number) => void;
  onVariantStockChange: (
    index: number,
    color: string,
    talle: string,
    value: number
  ) => void;
  onUpdateDiscount: (index: number, percent: number) => void;
}) {
  const handleUnitCostChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number.parseFloat(e.target.value);
    if (!Number.isNaN(value)) {
      onUpdateUnitCost(index, value);
    } else if (e.target.value === "") {
      onUpdateUnitCost(index, 0);
    }
  };

  const handleDiscountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number.parseFloat(e.target.value);
    if (!Number.isNaN(value) && value >= 0) {
      onUpdateDiscount(index, value);
    } else if (e.target.value === "") {
      onUpdateDiscount(index, 0);
    }
  };

  const discountValue =
    Number.isNaN(item.discount_percent) || item.discount_percent === 0
      ? ""
      : item.discount_percent;

  return (
    <div className="space-y-3 px-4 py-3" key={`${item.product_id}-${index}`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{item.product_name}</p>
            {product?.brand ? (
              <span className="text-muted-foreground text-xs">
                {product.brand}
              </span>
            ) : null}
          </div>
          <p className="text-muted-foreground text-sm">
            SKU {product?.sku ?? "N/A"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">
            Cant: {item.quantity}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Eliminar producto"
                className="hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onRemoveItem(index)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <TrashIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Eliminar producto</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      {variantMeta ? (
        <div className="overflow-x-auto">
          <VariantStockMatrix
            colores={variantMeta.colores}
            editable
            onChange={(color, talle, value) =>
              onVariantStockChange(index, color, talle, value)
            }
            stocks={item.variant_stocks ?? {}}
            talles={variantMeta.talles}
          />
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Cargando variantes...</p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-5">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Precio</span>
          <div className="flex items-center gap-1">
            <span className="text-sm">$</span>
            <Input
              className="h-8 w-20"
              min={0}
              onChange={handleUnitCostChange}
              placeholder="0.00"
              step="0.01"
              type="number"
              value={item.unit_cost || ""}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Descuento %</span>
          <Input
            className="h-8 w-20"
            inputMode="decimal"
            max={100}
            min={0}
            onChange={handleDiscountChange}
            step="0.01"
            type="number"
            value={discountValue}
          />
        </div>

        <div className="flex flex-col items-start gap-1">
          <span className="text-muted-foreground text-xs">Subtotal</span>
          <p className="font-medium">{formatCurrency(item.subtotal)}</p>
        </div>
      </div>
    </div>
  );
}

function NonVariantItemRow({
  item,
  index,
  product,
  onRemoveItem,
  onUpdateQuantity,
  onUpdateUnitCost,
  onUpdatePricePerKg,
  onUpdateDiscount,
}: {
  item: PurchaseItem;
  index: number;
  product: ProductWithPrice | undefined;
  onRemoveItem: (index: number) => void;
  onUpdateQuantity: (index: number, quantity: number) => void;
  onUpdateUnitCost: (index: number, cost: number) => void;
  onUpdatePricePerKg: (index: number, price: number) => void;
  onUpdateDiscount: (index: number, percent: number) => void;
}) {
  const unitOfMeasure = getUnitOfMeasure(item.unit_of_measure);
  const unitLabel = getUnitLabelName(unitOfMeasure);

  const itemIsWeightOrVolume = isWeightOrVolumeUnit(unitOfMeasure);

  const measureLabelMap: Record<string, string> = {
    KG: "Peso (kg)",
    LT: "Volumen (lt)",
    MT: "Longitud (m)",
  };
  const measureLabel = itemIsWeightOrVolume
    ? (measureLabelMap[unitOfMeasure] ?? "Medida")
    : "Medida";

  let measureValue: number | undefined;
  if (itemIsWeightOrVolume) {
    measureValue =
      unitOfMeasure === "KG" ? item.total_weight_kg : item.unit_quantity;
  }

  const showMeasure =
    itemIsWeightOrVolume && measureValue !== undefined && measureValue > 0;

  const measureDisplay = showMeasure
    ? formatMeasureValue(measureValue ?? 0, unitLabel)
    : unitLabel;

  const handleNumericChange =
    (field: "quantity" | "unitCost" | "pricePerKg" | "discount") =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseInputValue(e);
      if (value === null) {
        return;
      }
      if (field !== "unitCost" && value < 0) {
        return;
      }
      const updateMap = {
        quantity: onUpdateQuantity,
        unitCost: onUpdateUnitCost,
        pricePerKg: onUpdatePricePerKg,
        discount: onUpdateDiscount,
      } as const;
      updateMap[field](index, value);
    };

  const qtyValue = getEmptyOrValue(item.quantity);
  const discountValue = getEmptyOrValue(item.discount_percent);

  return (
    <div
      className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,2fr)_80px_100px_100px_80px_120px_auto] sm:items-center"
      key={`${item.product_id}-${index}`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{item.product_name}</p>
          {product?.brand ? (
            <span className="text-muted-foreground text-xs">
              {product.brand}
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground text-sm">
          SKU {product?.sku ?? "N/A"}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">Cantidad</span>
        <Input
          className="h-8 w-full"
          inputMode="decimal"
          min={0}
          onChange={handleNumericChange("quantity")}
          placeholder="0"
          step="0.01"
          type="number"
          value={qtyValue}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">{measureLabel}</span>
        <span className="text-sm">{measureDisplay}</span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">Precio</span>
        {itemIsWeightOrVolume && item.weight_per_unit ? (
          <div className="flex items-center gap-1">
            <span className="text-sm">$</span>
            <Input
              className="h-8 w-20"
              min={0}
              onChange={handleNumericChange("pricePerKg")}
              placeholder="0.00"
              step="0.01"
              type="number"
              value={item.price_per_kg || ""}
            />
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <span className="text-sm">$</span>
            <Input
              className="h-8 w-20"
              min={0}
              onChange={handleNumericChange("unitCost")}
              placeholder="0.00"
              step="0.01"
              type="number"
              value={item.unit_cost || ""}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">Descuento %</span>
        <Input
          className="h-8 w-full"
          inputMode="decimal"
          max={100}
          min={0}
          onChange={handleNumericChange("discount")}
          step="0.01"
          type="number"
          value={discountValue}
        />
      </div>

      <div className="flex flex-col items-start gap-1 sm:items-end">
        <span className="text-muted-foreground text-xs">Subtotal</span>
        <p className="font-medium">{formatCurrency(item.subtotal)}</p>
      </div>

      <div className="flex items-center justify-start sm:justify-end">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="Eliminar producto"
              className="hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onRemoveItem(index)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <TrashIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Eliminar producto</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

type RenderItemProps = {
  item: PurchaseItem;
  index: number;
  products: ProductWithPrice[];
  variantMetaMap: Record<string, VariantMeta>;
  onRemoveItem: (index: number) => void;
  handleUpdateDiscount: (index: number, percent: number) => void;
  handleUpdateUnitCost: (index: number, cost: number) => void;
  handleVariantStockChange: (
    index: number,
    color: string,
    talle: string,
    value: number
  ) => void;
  handleUpdatePricePerKg: (index: number, price: number) => void;
  handleUpdateQuantity: (index: number, quantity: number) => void;
};

function renderPurchaseItem(props: RenderItemProps) {
  const {
    item,
    index,
    products,
    variantMetaMap,
    onRemoveItem,
    handleUpdateDiscount,
    handleUpdateUnitCost,
    handleVariantStockChange,
    handleUpdatePricePerKg,
    handleUpdateQuantity,
  } = props;

  const product = products.find((p) => p.id === item.product_id);
  const isVariantItem = item.has_variants && product?.has_variants;

  if (isVariantItem) {
    return (
      <VariantItemCard
        index={index}
        item={item}
        key={`${item.product_id}-${index}`}
        onRemoveItem={onRemoveItem}
        onUpdateDiscount={handleUpdateDiscount}
        onUpdateUnitCost={handleUpdateUnitCost}
        onVariantStockChange={handleVariantStockChange}
        product={product}
        variantMeta={variantMetaMap[item.product_id]}
      />
    );
  }

  return (
    <NonVariantItemRow
      index={index}
      item={item}
      key={`${item.product_id}-${index}`}
      onRemoveItem={onRemoveItem}
      onUpdateDiscount={handleUpdateDiscount}
      onUpdatePricePerKg={handleUpdatePricePerKg}
      onUpdateQuantity={handleUpdateQuantity}
      onUpdateUnitCost={handleUpdateUnitCost}
      product={product}
    />
  );
}

type ItemsViewProps = {
  items: PurchaseItem[];
  products: ProductWithPrice[];
  variantMetaMap: Record<string, VariantMeta>;
  onRemoveItem: (index: number) => void;
  handleUpdateDiscount: (index: number, percent: number) => void;
  handleUpdateUnitCost: (index: number, cost: number) => void;
  handleVariantStockChange: (
    index: number,
    color: string,
    talle: string,
    value: number
  ) => void;
  handleUpdatePricePerKg: (index: number, price: number) => void;
  handleUpdateQuantity: (index: number, quantity: number) => void;
};

export function ItemsView({
  items,
  products,
  variantMetaMap,
  onRemoveItem,
  handleUpdateDiscount,
  handleUpdateUnitCost,
  handleVariantStockChange,
  handleUpdatePricePerKg,
  handleUpdateQuantity,
}: ItemsViewProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border">
        <Empty>
          <EmptyContent>
            <EmptyTitle>Sin productos agregados</EmptyTitle>
            <EmptyDescription>
              Selecciona un producto y cantidad para sumarlo a la compra.
            </EmptyDescription>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <div className="divide-y">
        {items.map((item, index) =>
          renderPurchaseItem({
            item,
            index,
            products,
            variantMetaMap,
            onRemoveItem,
            handleUpdateDiscount,
            handleUpdateUnitCost,
            handleVariantStockChange,
            handleUpdatePricePerKg,
            handleUpdateQuantity,
          })
        )}
      </div>
    </div>
  );
}
