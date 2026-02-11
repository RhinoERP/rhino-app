"use client";

import { Package, Warning } from "@phosphor-icons/react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { StockItem } from "@/modules/inventory/types";

function getUnitLabel(unitOfMeasure: string): string {
  if (unitOfMeasure === "KG") {
    return "kg";
  }
  if (unitOfMeasure === "LT") {
    return "lt";
  }
  if (unitOfMeasure === "MT") {
    return "m";
  }
  return "un";
}

function StockSku({ sku }: { sku: string | null | undefined }) {
  if (!sku) {
    return null;
  }

  return (
    <div className="mt-1 font-mono text-muted-foreground text-xs">
      SKU: {sku}
    </div>
  );
}

function StockPriceTag({
  salePrice,
}: {
  salePrice: number | null | undefined;
}) {
  let formattedPrice = "-";
  if (salePrice != null) {
    formattedPrice = `$${salePrice.toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  return (
    <div className="rounded-md bg-primary/10 px-3 py-1.5">
      <div className="text-muted-foreground text-xs">Precio</div>
      <div className="font-bold text-lg text-primary tabular-nums">
        {formattedPrice}
      </div>
    </div>
  );
}

function StockQuantityTag({
  totalStock,
  unitLabel,
  isLowStock,
  tracksUnits,
  totalUnits,
}: {
  totalStock: number;
  unitLabel: string;
  isLowStock: boolean;
  tracksUnits: boolean;
  totalUnits: number;
}) {
  return (
    <div
      className={`rounded-md px-3 py-1.5 ${
        isLowStock ? "bg-destructive/10" : "bg-muted"
      }`}
    >
      <div className="flex items-center gap-1 text-muted-foreground text-xs">
        {isLowStock && (
          <Warning className="size-3 text-destructive" weight="fill" />
        )}
        <span>Stock</span>
      </div>
      <div
        className={`font-bold text-lg tabular-nums ${
          isLowStock ? "text-destructive" : ""
        }`}
      >
        {totalStock.toLocaleString("es-AR", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        })}{" "}
        {unitLabel}
      </div>
      {tracksUnits ? (
        <div className="text-muted-foreground text-xs tabular-nums">
          {totalUnits.toLocaleString("es-AR", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })}{" "}
          un
        </div>
      ) : null}
    </div>
  );
}

function StockProfitMargin({
  profitMargin,
}: {
  profitMargin: number | null | undefined;
}) {
  if (profitMargin == null) {
    return null;
  }

  return (
    <div className="text-muted-foreground text-sm">
      <span className="font-medium">
        {profitMargin.toLocaleString("es-AR", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })}
        %
      </span>{" "}
      margen
    </div>
  );
}

function StockMetaBadges({ item }: { item: StockItem }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {item.category_name ? (
        <Badge className="text-xs" variant="outline">
          {item.category_name}
        </Badge>
      ) : null}
      {item.supplier_name ? (
        <span className="text-muted-foreground">
          Prov: {item.supplier_name}
        </span>
      ) : null}
      <Badge
        className="text-xs"
        variant={item.is_active ? "default" : "secondary"}
      >
        {item.is_active ? "Activo" : "Inactivo"}
      </Badge>
    </div>
  );
}

type StockMobileCardProps = {
  item: StockItem;
  orgSlug: string;
  isSelected: boolean;
  onToggleSelection: () => void;
};

function StockMobileCard({
  item,
  orgSlug,
  isSelected,
  onToggleSelection,
}: StockMobileCardProps) {
  const unitOfMeasure = item.unit_of_measure ?? "UN";
  const isWeightBased = unitOfMeasure === "KG" || unitOfMeasure === "LT";
  const tracksUnits = isWeightBased && Boolean(item.tracks_stock_units);
  const totalUnits = item.total_unit_stock ?? 0;
  const unitLabel = getUnitLabel(unitOfMeasure);
  const totalStock = item.total_stock ?? 0;
  const isLowStock = totalStock <= 0;
  const href = `/org/${orgSlug}/stock/${item.product_id}`;

  return (
    <Card
      className={`transition-colors ${isSelected ? "border-primary bg-primary/5" : ""}`}
    >
      <CardContent className="p-4">
        <div className="flex gap-3">
          {/* Selection Checkbox */}
          <div className="pt-1">
            <Checkbox
              aria-label={`Seleccionar ${item.product_name}`}
              checked={isSelected}
              onCheckedChange={onToggleSelection}
            />
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1 space-y-3">
            {/* Header: Name + SKU */}
            <div>
              <Link
                className="block font-semibold leading-tight transition-colors hover:text-primary"
                href={href}
              >
                <span className="wrap-break-word whitespace-normal">
                  {item.product_name}
                </span>
              </Link>
              <StockSku sku={item.sku} />
            </div>

            {/* Price & Stock - Highlighted */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Sale Price */}
              <StockPriceTag salePrice={item.sale_price} />

              {/* Stock */}
              <StockQuantityTag
                isLowStock={isLowStock}
                totalStock={totalStock}
                totalUnits={totalUnits}
                tracksUnits={tracksUnits}
                unitLabel={unitLabel}
              />

              {/* Profit Margin */}
              <StockProfitMargin profitMargin={item.profit_margin} />
            </div>

            {/* Meta Info: Category, Supplier, Status */}
            <StockMetaBadges item={item} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type StockMobileListProps = {
  items: StockItem[];
  orgSlug: string;
  selectedIds: Set<string>;
  onToggleSelection: (productId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  EmptyStateAction?: React.ReactNode;
};

export function StockMobileList({
  items,
  orgSlug,
  selectedIds,
  onToggleSelection,
  onSelectAll,
  onClearSelection,
  EmptyStateAction,
}: StockMobileListProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Package className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>No hay productos</EmptyTitle>
            <EmptyDescription>
              Aún no has agregado ningún producto a esta organización.
            </EmptyDescription>
          </EmptyHeader>
          {EmptyStateAction && <EmptyContent>{EmptyStateAction}</EmptyContent>}
        </Empty>
      </div>
    );
  }

  const allSelected =
    items.length > 0 && items.every((item) => selectedIds.has(item.product_id));
  const someSelected =
    items.some((item) => selectedIds.has(item.product_id)) && !allSelected;

  return (
    <div className="space-y-4">
      {/* Bulk selection header */}
      <div className="flex items-center justify-between rounded-md border bg-card p-3">
        <div className="flex items-center gap-3">
          <Checkbox
            aria-label="Seleccionar todos"
            checked={allSelected || (someSelected && "indeterminate")}
            onCheckedChange={(value) => {
              if (value) {
                onSelectAll();
              } else {
                onClearSelection();
              }
            }}
          />
          <span className="font-medium text-sm">
            {selectedIds.size > 0
              ? `${selectedIds.size} seleccionado${selectedIds.size > 1 ? "s" : ""}`
              : "Seleccionar todo"}
          </span>
        </div>
      </div>

      {/* Mobile Cards List */}
      <div className="space-y-3">
        {items.map((item) => (
          <StockMobileCard
            isSelected={selectedIds.has(item.product_id)}
            item={item}
            key={item.product_id}
            onToggleSelection={() => onToggleSelection(item.product_id)}
            orgSlug={orgSlug}
          />
        ))}
      </div>
    </div>
  );
}
