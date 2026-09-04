import { redirect } from "next/navigation";
import { CommissionsMetrics } from "@/components/commissions/commissions-metrics";
import {
  getCommissionMetrics,
  getCommissionsPaginated,
} from "@/modules/commissions/service/commissions.service";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { isOrganizationModuleEnabled } from "@/modules/organizations/utils/module-flags";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { CommissionsDataTable } from "./data-table";

type SortParam = { id: string; desc: boolean };

type CommissionsPageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{
    page?: string;
    perPage?: string;
    sort?: string;
    search?: string;
    mes?: string;
    sellerId?: string;
  }>;
};

export default async function CommissionsPage({
  params,
  searchParams,
}: CommissionsPageProps) {
  const { orgSlug } = await params;
  const sp = await searchParams;

  const org = await getOrganizationBySlug(orgSlug);

  if (!isOrganizationModuleEnabled(org, "commissions")) {
    redirect(`/org/${orgSlug}`);
  }

  await guardOrganizationPermissionAccess(
    orgSlug,
    READ_PERMISSIONS.commissions
  );

  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.perPage) || 20));
  const search = sp.search || undefined;
  const month = sp.mes || undefined;
  const sellerId = sp.sellerId || undefined;

  let sort: SortParam[] | undefined;
  if (sp.sort) {
    try {
      sort = JSON.parse(sp.sort);
    } catch {
      sort = undefined;
    }
  }

  const [paginated, metrics] = await Promise.all([
    getCommissionsPaginated(orgSlug, {
      page,
      pageSize,
      sort,
      search,
      month,
      sellerId,
    }),
    getCommissionMetrics(orgSlug, month),
  ]);

  const pageCount = Math.max(1, Math.ceil(paginated.totalCount / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-heading text-2xl">Comisiones</h1>
          <p className="text-muted-foreground text-sm">
            Comisiones generadas por los cobros registrados.
          </p>
        </div>
      </div>
      <CommissionsMetrics metrics={metrics} />
      <CommissionsDataTable
        data={paginated.data}
        month={month}
        orgSlug={orgSlug}
        pageCount={pageCount}
      />
    </div>
  );
}
