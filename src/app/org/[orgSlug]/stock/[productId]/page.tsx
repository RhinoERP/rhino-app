import { ArrowLeft, Boxes } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductInfoCard } from "@/components/products/product-info-card";
import { ProductLotsCard } from "@/components/products/product-lots-card";
import { ProductSalePriceCard } from "@/components/products/product-sale-price-card";
import { ProductVariantsStockCard } from "@/components/products/product-variants-stock-card";
import { StockMovementsCard } from "@/components/products/stock-movements-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getCategories,
  getProductDetail,
  getProductLots,
  getStockMovementsForProduct,
  getSuppliers,
} from "@/modules/inventory/service/inventory.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { isOrganizationModuleEnabled } from "@/modules/organizations/utils/module-flags";

type ProductDetailsPageProps = {
  params: Promise<{
    orgSlug: string;
    productId: string;
  }>;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Page component renders complex layout based on product details
export default async function ProductDetailsPage({
  params,
}: ProductDetailsPageProps) {
  const { orgSlug, productId } = await params;

  const [productDetail, lots, movements, categories, suppliers, org] =
    await Promise.all([
      getProductDetail(orgSlug, productId),
      getProductLots(orgSlug, productId),
      getStockMovementsForProduct(orgSlug, productId, 50),
      getCategories(orgSlug),
      getSuppliers(orgSlug),
      getOrganizationBySlug(orgSlug),
    ]);

  const isProductionEnabled = org
    ? isOrganizationModuleEnabled(org, "production")
    : false;

  if (!productDetail) {
    notFound();
  }

  const {
    product,
    totalStock,
    totalUnitStock,
    category,
    supplier,
    costPrice,
    salePrice,
  } = productDetail;
  const resolvedSalePrice = salePrice ?? product.sale_price ?? null;
  const isWeightBased =
    product.unit_of_measure === "KG" || product.unit_of_measure === "LT";
  const tracksUnits = isWeightBased && Boolean(product.tracks_stock_units);

  let stockLabel = "Unidades disponibles";
  if (isWeightBased) {
    stockLabel =
      product.unit_of_measure === "KG"
        ? "Kg disponibles"
        : "Litros disponibles";
  }

  let associatedUnits: number | null = null;
  if (tracksUnits) {
    associatedUnits = totalUnitStock != null ? totalUnitStock : 0;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/org/${orgSlug}/stock`}>
          <Button size="sm" variant="ghost">
            <ArrowLeft className="h-4 w-4" />
            Volver al stock
          </Button>
        </Link>
      </div>

      {/* Mobile: Stack vertically, Desktop: Side by side */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Main Content */}
        <div className="flex-1 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h1 className="font-bold text-3xl leading-tight">
                {product.name}
              </h1>
              <p className="text-muted-foreground">
                {product.brand || "Sin marca"} · SKU {product.sku}
              </p>
            </div>
          </div>

          {/* Mobile: Product Info appears here (first) */}
          <div className="block lg:hidden">
            <ProductInfoCard
              categories={categories}
              category={category}
              costPrice={costPrice}
              isProductionEnabled={isProductionEnabled}
              orgSlug={orgSlug}
              product={product}
              salePrice={resolvedSalePrice}
              supplier={supplier}
              suppliers={suppliers}
            />
          </div>

          {/* Metrics Cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-primary/10 p-2 text-primary">
                    <Boxes className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-base">Stock total</CardTitle>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-2xl tabular-nums">
                    {totalStock.toLocaleString("es-AR")}
                  </p>
                  <CardDescription>{stockLabel}</CardDescription>
                  {tracksUnits ? (
                    <p className="text-muted-foreground text-xs">
                      Unidades asociadas:{" "}
                      {associatedUnits?.toLocaleString("es-AR") ?? "—"}
                    </p>
                  ) : null}
                </div>
              </CardHeader>
            </Card>

            <ProductSalePriceCard
              costPrice={costPrice}
              orgSlug={orgSlug}
              product={product}
              salePrice={resolvedSalePrice}
            />
          </div>

          {/* Stock Movements - Hidden on mobile (not relevant for sellers) */}
          <div className="hidden lg:block">
            <StockMovementsCard
              lots={lots}
              movements={movements}
              orgSlug={orgSlug}
              product={product}
              productId={productId}
            />
          </div>

          {/* Variants Stock - Visible if product has variants */}
          {product.has_variants ? (
            <ProductVariantsStockCard
              minStock={product.min_stock ?? 0}
              orgSlug={orgSlug}
              productId={productId}
            />
          ) : null}

          {/* Lots - Hidden if product has variants */}
          {product.has_variants ? null : (
            <ProductLotsCard
              lots={lots}
              orgSlug={orgSlug}
              product={product}
              productId={productId}
            />
          )}
        </div>

        {/* Desktop: Product Info appears here (sidebar) */}
        <div className="hidden w-full lg:block lg:w-80 lg:max-w-xs xl:max-w-sm">
          <ProductInfoCard
            categories={categories}
            category={category}
            costPrice={costPrice}
            isProductionEnabled={isProductionEnabled}
            orgSlug={orgSlug}
            product={product}
            salePrice={resolvedSalePrice}
            supplier={supplier}
            suppliers={suppliers}
          />
        </div>
      </div>
    </div>
  );
}
