import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { PurchasesMetrics } from "@/components/purchases/shared/purchases-metrics";
import { PurchasesDataTable } from "@/components/purchases/tables/purchases-data-table";
import { Button } from "@/components/ui/button";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { isOrganizationModuleEnabled } from "@/modules/organizations/utils/module-flags";
import {
  getPurchaseMetrics,
  getPurchasesPaginated,
} from "@/modules/purchases/service/purchases.service";
import type { SortParam } from "@/modules/purchases/types";

type PurchasesPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
  searchParams: Promise<{
    page?: string;
    perPage?: string;
    sort?: string;
    search?: string;
    estado?: string;
  }>;
};

export default async function PurchasesPage({
  params,
  searchParams,
}: PurchasesPageProps) {
  const { orgSlug } = await params;
  const sp = await searchParams;

  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(sp.perPage) || 20));
  const search = sp.search || undefined;
  const estado = sp.estado || undefined;

  let sort: SortParam[] | undefined;
  if (sp.sort) {
    try {
      sort = JSON.parse(sp.sort);
    } catch {
      sort = undefined;
    }
  }

  const [[org, _orgErr], paginated, metrics] = await Promise.all([
    getOrganizationBySlug(orgSlug)
      .then((o) => [o, null] as const)
      .catch((e) => [null, e] as const),
    getPurchasesPaginated(orgSlug, { page, pageSize, sort, search, estado }),
    getPurchaseMetrics(orgSlug),
  ]);

  const showPrePurchasesTab = org
    ? isOrganizationModuleEnabled(org, "production")
    : false;

  const pageCount = Math.max(1, Math.ceil(paginated.totalCount / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Compras</h1>
          <p className="text-muted-foreground text-sm">
            Consulta todas las compras de la organización.
          </p>
        </div>
        <Button asChild>
          <Link href={`/org/${orgSlug}/compras/nueva`}>
            <PlusIcon className="mr-2 h-4 w-4" weight="bold" />
            Nueva compra
          </Link>
        </Button>
      </div>

      <PurchasesMetrics metrics={metrics} />

      <PurchasesDataTable
        data={paginated.data}
        orgSlug={orgSlug}
        pageCount={pageCount}
        showPrePurchasesTab={showPrePurchasesTab}
      />
    </div>
  );
}
