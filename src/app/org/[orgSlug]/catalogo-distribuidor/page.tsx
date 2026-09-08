import {
  parseSearchParams,
  type SearchParamsInput,
} from "@/lib/parse-search-params";
import { getDistributorCatalog } from "@/modules/inventory/service/inventory.service";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { getOrgSettings } from "@/modules/organizations/service/org-settings.service";
import { DistributorCatalogTable } from "./data-table";

type DistributorCatalogPageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<SearchParamsInput>;
};

export default async function DistributorCatalogPage({
  params,
  searchParams,
}: DistributorCatalogPageProps) {
  const { orgSlug } = await params;
  const sp = await searchParams;

  await guardOrganizationPermissionAccess(orgSlug, ["distributor.catalog"]);

  const { page, pageSize, search, sort } = parseSearchParams(sp, 20);

  const settings = await getOrgSettings(orgSlug);
  const margin = settings.distributor_catalog_margin;

  const paginated = await getDistributorCatalog(orgSlug, margin, {
    page,
    pageSize,
    search,
    sort,
  });

  const pageCount = Math.max(1, Math.ceil(paginated.totalCount / pageSize));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Catálogo Distribuidor</h1>
        <p className="text-muted-foreground text-sm">
          Stock disponible y precio de distribuidor (costo + {margin}%).
        </p>
      </div>

      <DistributorCatalogTable data={paginated.data} pageCount={pageCount} />
    </div>
  );
}
