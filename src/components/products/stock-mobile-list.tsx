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
  const isLowStock = (item.total_stock ?? 0) <= 0;
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
              {item.sku && (
                <div className="mt-1 font-mono text-muted-foreground text-xs">
                  SKU: {item.sku}
                </div>
              )}
              {item.brand && (
                <div className="mt-0.5 text-muted-foreground text-xs">
                  {item.brand}
                </div>
              )}
            </div>

            {/* Price & Stock - Highlighted */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Sale Price */}
              <div className="rounded-md bg-primary/10 px-3 py-1.5">
                <div className="text-muted-foreground text-xs">Precio</div>
                <div className="font-bold text-lg text-primary tabular-nums">
                  {item.sale_price != null
                    ? `$${item.sale_price.toLocaleString("es-AR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`
                    : "-"}
                </div>
              </div>

              {/* Stock */}
              <div
                className={`rounded-md px-3 py-1.5 ${
                  isLowStock ? "bg-destructive/10" : "bg-muted"
                }`}
              >
                <div className="flex items-center gap-1 text-muted-foreground text-xs">
                  {isLowStock && (
                    <Warning
                      className="size-3 text-destructive"
                      weight="fill"
                    />
                  )}
                  <span>Stock</span>
                </div>
                <div
                  className={`font-bold text-lg tabular-nums ${
                    isLowStock ? "text-destructive" : ""
                  }`}
                >
                  {(item.total_stock ?? 0).toLocaleString("es-AR", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>

              {/* Profit Margin */}
              {item.profit_margin != null && (
                <div className="text-muted-foreground text-sm">
                  <span className="font-medium">
                    {item.profit_margin.toLocaleString("es-AR", {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                    %
                  </span>{" "}
                  margen
                </div>
              )}
            </div>

            {/* Meta Info: Category, Supplier, Status */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {item.category_name && (
                <Badge className="text-xs" variant="outline">
                  {item.category_name}
                </Badge>
              )}
              {item.supplier_name && (
                <span className="text-muted-foreground">
                  Prov: {item.supplier_name}
                </span>
              )}
              <Badge
                className="text-xs"
                variant={item.is_active ? "default" : "secondary"}
              >
                {item.is_active ? "Activo" : "Inactivo"}
              </Badge>
            </div>
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
