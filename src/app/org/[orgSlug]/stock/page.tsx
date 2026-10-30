import { AddProductDialog } from "@/components/products/add-product-dialog";
import { StockMetricsCards } from "@/components/stock/stock-metrics";
import { StockTransferHistoryDialog } from "@/components/stock/stock-transfer-history-dialog";
import { WarehouseStockBreakdownDialog } from "@/components/stock/warehouse-stock-breakdown-dialog";
import { parseSearchParams } from "@/lib/parse-search-params";
import { getCategoriesByOrgSlug } from "@/modules/categories/service/categories.service";
import {
  getStockMetrics,
  getStockPaginated,
  getSuppliers,
} from "@/modules/inventory/service/inventory.service";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import {
  getOrganizationBySlug,
  getOrganizationLayoutData,
} from "@/modules/organizations/service/organizations.service";
import { isOrganizationModuleEnabled } from "@/modules/organizations/utils/module-flags";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { getActiveTaxesByOrgSlug } from "@/modules/taxes/service/taxes.service";
import { StockDataTable } from "./data-table";

type StockPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
  searchParams: Promise<{
    page?: string;
    perPage?: string;
    sort?: string;
    search?: string;
    categoria?: string;
    status?: string;
  }>;
};

export default async function StockPage({
  params,
  searchParams,
}: StockPageProps) {
  const { orgSlug } = await params;
  const sp = await searchParams;

  await guardOrganizationPermissionAccess(orgSlug, [
    ...READ_PERMISSIONS.inventory,
    ...READ_PERMISSIONS.mercadolibre,
  ]);
  const layoutData = await getOrganizationLayoutData(orgSlug);
  const isMercadoLibreOnly = Boolean(
    layoutData?.permissions.includes("mercadolibre.access") &&
      !layoutData.permissions.includes("organization.admin") &&
      !layoutData.permissions.some((permission) =>
        READ_PERMISSIONS.inventory.includes(permission)
      )
  );

  const { page, pageSize, search, sort } = parseSearchParams(sp, 20);
  const category = sp.categoria || undefined;
  const status = sp.status || "active";

  const [paginated, metrics, suppliers, categoriesData, taxes, org] =
    await Promise.all([
      getStockPaginated(orgSlug, {
        page,
        pageSize,
        sort,
        search,
        category,
        status,
        skuPrefix: isMercadoLibreOnly ? "MELI-" : undefined,
      }),
      isMercadoLibreOnly ? Promise.resolve(null) : getStockMetrics(orgSlug),
      isMercadoLibreOnly ? Promise.resolve([]) : getSuppliers(orgSlug),
      isMercadoLibreOnly
        ? Promise.resolve([])
        : getCategoriesByOrgSlug(orgSlug),
      isMercadoLibreOnly
        ? Promise.resolve([])
        : getActiveTaxesByOrgSlug(orgSlug),
      getOrganizationBySlug(orgSlug),
    ]);

  const pageCount = Math.max(1, Math.ceil(paginated.totalCount / pageSize));

  const isProductionEnabled = org
    ? isOrganizationModuleEnabled(org, "production")
    : false;

  const isAccountingEnabled = org
    ? isOrganizationModuleEnabled(org, "accounting")
    : false;

  const categories = categoriesData.map(
    (cat: { id: string; name: string }) => ({
      id: cat.id,
      name: cat.name,
    })
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-heading text-2xl">Stock</h1>
          <p className="text-muted-foreground text-sm">
            {isMercadoLibreOnly
              ? "Consulta los productos del catálogo MercadoLibre."
              : "Consulta el inventario disponible de todos los productos."}
          </p>
        </div>
        {!isMercadoLibreOnly && (
          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
            <WarehouseStockBreakdownDialog orgSlug={orgSlug} />
            <StockTransferHistoryDialog orgSlug={orgSlug} />
            <AddProductDialog
              categories={categories}
              isAccountingEnabled={isAccountingEnabled}
              isProductionEnabled={isProductionEnabled}
              orgSlug={orgSlug}
              suppliers={suppliers}
              taxes={taxes}
            />
          </div>
        )}
      </div>

      {!isMercadoLibreOnly && metrics && (
        <StockMetricsCards metrics={metrics} />
      )}

      <StockDataTable
        categories={categories}
        data={paginated.data}
        key={orgSlug}
        orgSlug={orgSlug}
        pageCount={pageCount}
        suppliers={suppliers}
        viewOnly={isMercadoLibreOnly}
      />
    </div>
  );
}
