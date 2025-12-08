import { AddProductDialog } from "@/components/products/add-product-dialog";
import {
  getCategories,
  getStockSummary,
  getSuppliers,
} from "@/modules/inventory/service/inventory.service";
import { StockDataTable } from "./data-table";

type StockPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function StockPage({ params }: StockPageProps) {
  const { orgSlug } = await params;

  // Fetch data in parallel
  const [stockData, suppliers, categories] = await Promise.all([
    getStockSummary(orgSlug),
    getSuppliers(orgSlug),
    getCategories(orgSlug),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Stock</h1>
          <p className="text-muted-foreground text-sm">
            Consulta el inventario disponible de todos los productos.
          </p>
        </div>
        <AddProductDialog
          categories={categories}
          orgSlug={orgSlug}
          suppliers={suppliers}
        />
      </div>

      <StockDataTable
        categories={categories}
        data={stockData}
        orgSlug={orgSlug}
        suppliers={suppliers}
      />
    </div>
  );
}
