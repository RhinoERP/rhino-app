import { Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrency } from "@/lib/format";
import {
  calculateSalePrice,
  type SalePriceAdjustment,
} from "@/modules/price-levels/service/price-calculator";
import type { PriceLevel } from "@/modules/price-levels/types";
import type { SaleProduct } from "@/modules/sales/types";
import type { SalesPriceList } from "@/modules/sales-price-lists/types";

type ProductSearchProps = {
  products: SaleProduct[];
  onSelectProduct: (product: SaleProduct, quantity?: number) => void;
  level?: PriceLevel | null;
  adjustment?: SalesPriceList | null;
  currency?: string;
};

function getSearchPrice(
  product: SaleProduct,
  level: PriceLevel | null | undefined,
  adjustment: SalesPriceList | null | undefined
): number {
  const adjustments: SalePriceAdjustment[] = adjustment
    ? [{ type: adjustment.type, value: adjustment.value }]
    : [];

  const { price } = calculateSalePrice({
    basePrice: product.price || 0,
    costPrice: product.costPrice,
    level,
    adjustments,
  });

  return price;
}

const normalizeSearchValue = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function ProductMetaLine({
  product,
  level,
  adjustment,
}: {
  product: SaleProduct;
  level?: PriceLevel | null;
  adjustment?: SalesPriceList | null;
}) {
  const metaParts = [
    product.sku ? `SKU: ${product.sku}` : null,
    product.brand ?? null,
  ].filter(Boolean);

  return (
    <span className="text-muted-foreground text-xs">
      {metaParts.join(" · ")}
      {metaParts.length > 0 ? " • " : ""}
      {formatCurrency(getSearchPrice(product, level, adjustment))}
    </span>
  );
}

function CurrencyBadge({ currency }: { currency?: string }) {
  if (!currency || currency === "ARS") {
    return null;
  }
  return (
    <Badge className="ml-1 align-middle text-[10px]" variant="outline">
      USD
    </Badge>
  );
}

export function ProductSearch({
  products,
  onSelectProduct,
  level,
  adjustment,
  currency,
}: ProductSearchProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [pendingQuantity, setPendingQuantity] = useState<number>(1);

  const searchTokens = useMemo(() => {
    const normalized = normalizeSearchValue(searchTerm);
    return normalized ? normalized.split(" ").filter(Boolean) : [];
  }, [searchTerm]);

  const filteredProducts = useMemo(() => {
    const byCurrency = currency
      ? products.filter((product) => (product.currency ?? "ARS") === currency)
      : products;

    if (searchTokens.length === 0) {
      return byCurrency.slice(0, 10);
    }

    return byCurrency
      .filter((product) => {
        const nameTokens = normalizeSearchValue(product.name || "")
          .split(" ")
          .filter(Boolean);
        const sku = normalizeSearchValue(product.sku || "");

        return searchTokens.every((token) => {
          if (sku.startsWith(token)) {
            return true;
          }
          return nameTokens.some((word) => word.startsWith(token));
        });
      })
      .slice(0, 20);
  }, [products, searchTokens, currency]);

  const handleStartAdd = (product: SaleProduct) => {
    setActivatingId(product.id);
    setPendingQuantity(1);
  };

  const handleConfirmAdd = (product: SaleProduct) => {
    onSelectProduct(product, pendingQuantity);
    setActivatingId(null);
    setPendingQuantity(1);
  };

  const handleCancel = () => {
    setActivatingId(null);
    setPendingQuantity(1);
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3">
      <div className="relative">
        <Search className="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
        <Input
          className="bg-background pl-8"
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar producto por nombre o SKU..."
          value={searchTerm}
        />
      </div>

      <ScrollArea className="h-[250px] rounded-md border bg-background">
        <div className="flex flex-col divide-y">
          {filteredProducts.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              {currency
                ? `No hay productos en ${currency} para esta búsqueda.`
                : "No se encontraron productos."}
            </div>
          ) : (
            filteredProducts.map((product) => {
              const isActivating = activatingId === product.id;

              return (
                <div
                  className="flex items-center justify-between gap-2 p-3 transition-colors hover:bg-muted/50"
                  key={product.id}
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-sm">
                      {product.name}
                      <CurrencyBadge currency={product.currency} />
                    </span>
                    <ProductMetaLine
                      adjustment={adjustment}
                      level={level}
                      product={product}
                    />
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {!product.hasVariants && isActivating ? (
                      <>
                        <Input
                          autoFocus
                          className="h-8 w-16 text-center"
                          min={1}
                          onChange={(e) =>
                            setPendingQuantity(
                              Math.max(1, Number(e.target.value))
                            )
                          }
                          type="number"
                          value={pendingQuantity}
                        />
                        <Button
                          onClick={() => handleConfirmAdd(product)}
                          size="sm"
                          type="button"
                          variant="default"
                        >
                          Agregar
                        </Button>
                        <Button
                          onClick={handleCancel}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        onClick={() =>
                          product.hasVariants
                            ? onSelectProduct(product)
                            : handleStartAdd(product)
                        }
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        {product.hasVariants ? "Elegir Talles" : "Agregar"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
