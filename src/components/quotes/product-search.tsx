import { Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { truncateMoney } from "@/lib/decimal";
import { formatCurrency } from "@/lib/format";
import type { SaleProduct } from "@/modules/sales/types";
import type { SalesPriceList } from "@/modules/sales-price-lists/types";

type ProductSearchProps = {
  products: SaleProduct[];
  onSelectProduct: (product: SaleProduct, quantity?: number) => void;
  priceList?: SalesPriceList | null;
};

function getSearchPrice(
  product: SaleProduct,
  priceList: SalesPriceList | null | undefined
): number {
  if (!priceList?.is_active) {
    return product.price || 0;
  }

  const today = new Date().toISOString().split("T")[0];
  if (priceList.valid_from > today) {
    return product.price || 0;
  }

  if (priceList.is_target_margin && product.costPrice != null) {
    return truncateMoney(product.costPrice * (1 + priceList.value / 100));
  }

  if (priceList.type === "PRICE") {
    return Math.max(0, (product.price || 0) + priceList.value);
  }

  return truncateMoney((product.price || 0) * (1 + priceList.value / 100));
}

const normalizeSearchValue = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function ProductSearch({
  products,
  onSelectProduct,
  priceList,
}: ProductSearchProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [pendingQuantity, setPendingQuantity] = useState<number>(1);

  const searchTokens = useMemo(() => {
    const normalized = normalizeSearchValue(searchTerm);
    return normalized ? normalized.split(" ").filter(Boolean) : [];
  }, [searchTerm]);

  const filteredProducts = useMemo(() => {
    if (searchTokens.length === 0) {
      return products.slice(0, 10);
    }

    return products
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
  }, [products, searchTokens]);

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
              No se encontraron productos.
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
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {product.sku && `SKU: ${product.sku} • `}
                      {formatCurrency(getSearchPrice(product, priceList))}
                    </span>
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
