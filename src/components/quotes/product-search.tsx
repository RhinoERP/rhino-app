import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrency } from "@/lib/format";
import type { SaleProduct } from "@/modules/sales/types";

// Interfaz adaptada al producto de Rhino ERP (SaleProduct)
type ProductSearchProps = {
  products: SaleProduct[];
  onSelectProduct: (product: SaleProduct) => void;
};

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
}: ProductSearchProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const searchTokens = useMemo(() => {
    const normalized = normalizeSearchValue(searchTerm);
    return normalized ? normalized.split(" ").filter(Boolean) : [];
  }, [searchTerm]);

  const filteredProducts = useMemo(() => {
    if (searchTokens.length === 0) {
      return products.slice(0, 10); // Mostrar algunos por defecto
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
      .slice(0, 20); // Límite para rendimiento
  }, [products, searchTokens]);

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
            filteredProducts.map((product) => (
              <div
                className="flex items-center justify-between p-3 transition-colors hover:bg-muted/50"
                key={product.id}
              >
                <div className="flex flex-col">
                  <span className="font-medium text-sm">{product.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {product.sku && `SKU: ${product.sku} • `}
                    {formatCurrency(product.price || 0)}
                  </span>
                </div>
                <Button
                  onClick={() => onSelectProduct(product)}
                  size="sm"
                  variant="ghost"
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Elegir Talles
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
