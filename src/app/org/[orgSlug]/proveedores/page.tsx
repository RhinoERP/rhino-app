import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
import { SuppliersMetrics } from "@/components/suppliers/suppliers-metrics";
import { parseSearchParams } from "@/lib/parse-search-params";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import {
  getSupplierMetrics,
  getSuppliersPaginated,
} from "@/modules/suppliers/service/suppliers.service";
import { SuppliersDataTable } from "./data-table";

type SuppliersPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
  searchParams: Promise<{
    page?: string;
    perPage?: string;
    sort?: string;
    search?: string;
  }>;
};

export default async function SuppliersPage({
  params,
  searchParams,
}: SuppliersPageProps) {
  const { orgSlug } = await params;
  await guardOrganizationPermissionAccess(orgSlug, READ_PERMISSIONS.suppliers);
  const sp = await searchParams;

  const { page, pageSize, search, sort } = parseSearchParams(sp, 20);

  const [result, metrics] = await Promise.all([
    getSuppliersPaginated(orgSlug, { page, pageSize, sort, search }),
    getSupplierMetrics(orgSlug),
  ]);

  const pageCount = Math.max(1, Math.ceil(result.totalCount / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Proveedores</h1>
          <p className="text-muted-foreground text-sm">
            Consulta todos los proveedores de la organización.
          </p>
        </div>
        <AddSupplierDialog orgSlug={orgSlug} />
      </div>
      <SuppliersMetrics metrics={metrics} />
      <SuppliersDataTable
        data={result.data}
        orgSlug={orgSlug}
        pageCount={pageCount}
      />
    </div>
  );
}
