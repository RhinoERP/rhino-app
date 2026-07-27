import { AddProductDialog } from "@/components/products/add-product-dialog";
import { parseSearchParams } from "@/lib/parse-search-params";
import { getCategoriesByOrgSlug } from "@/modules/categories/service/categories.service";
import {
  getStockPaginated,
  getSuppliers,
} from "@/modules/inventory/service/inventory.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { isOrganizationModuleEnabled } from "@/modules/organizations/utils/module-flags";
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

  const { page, pageSize, search, sort } = parseSearchParams(sp, 20);
  const category = sp.categoria || undefined;
  const status = sp.status || "active";

  const [paginated, suppliers, categoriesData, taxes, org] = await Promise.all([
    getStockPaginated(orgSlug, {
      page,
      pageSize,
      sort,
      search,
      category,
      status,
    }),
    getSuppliers(orgSlug),
    getCategoriesByOrgSlug(orgSlug),
    getActiveTaxesByOrgSlug(orgSlug),
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
            Consulta el inventario disponible de todos los productos.
          </p>
        </div>
        <div className="w-full md:w-auto">
          <AddProductDialog
            categories={categories}
            isAccountingEnabled={isAccountingEnabled}
            isProductionEnabled={isProductionEnabled}
            orgSlug={orgSlug}
            suppliers={suppliers}
            taxes={taxes}
          />
        </div>
      </div>

      <StockDataTable
        categories={categories}
        data={paginated.data}
        key={orgSlug}
        orgSlug={orgSlug}
        pageCount={pageCount}
        suppliers={suppliers}
      />
    </div>
  );
}
