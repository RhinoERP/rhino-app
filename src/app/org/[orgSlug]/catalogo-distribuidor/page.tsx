import { getDistributorCatalog } from "@/modules/inventory/service/inventory.service";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { getOrgSettings } from "@/modules/organizations/service/org-settings.service";
import { DistributorCatalogTable } from "./data-table";

type DistributorCatalogPageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ search?: string }>;
};

export default async function DistributorCatalogPage({
  params,
  searchParams,
}: DistributorCatalogPageProps) {
  const { orgSlug } = await params;
  const { search } = await searchParams;

  await guardOrganizationPermissionAccess(orgSlug, ["distributor.catalog"]);

  const settings = await getOrgSettings(orgSlug);
  const margin = settings.distributor_catalog_margin;

  const data = await getDistributorCatalog(orgSlug, margin, search);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Catálogo Distribuidor</h1>
        <p className="text-muted-foreground text-sm">
          Stock disponible y precio de distribuidor (costo + {margin}%).
        </p>
      </div>

      <DistributorCatalogTable data={data} />
    </div>
  );
}
