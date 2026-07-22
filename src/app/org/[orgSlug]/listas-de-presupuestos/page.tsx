import Link from "next/link";
import { notFound } from "next/navigation";
import { QuotesMetrics } from "@/components/quotes/quotes-metrics";
import { QuotesTable } from "@/components/quotes/quotes-table";
import { Button } from "@/components/ui/button";
import { parseSearchParams } from "@/lib/parse-search-params";
import { guardOrganizationModuleAccess } from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  getQuotesMetrics,
  getQuotesPaginated,
} from "@/modules/quotes/service/quotes.service";

type QuotesPageProps = {
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

export default async function QuotesListPage({
  params,
  searchParams,
}: QuotesPageProps) {
  const { orgSlug } = await params;
  const sp = await searchParams;

  await guardOrganizationModuleAccess(orgSlug, "production");

  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) {
    notFound();
  }

  const { page, pageSize, search, sort } = parseSearchParams(sp, 20);
  const status = sp.estado || undefined;

  const [paginated, metrics] = await Promise.all([
    getQuotesPaginated(orgSlug, { page, pageSize, sort, search, status }),
    getQuotesMetrics(orgSlug),
  ]);

  const pageCount = Math.max(1, Math.ceil(paginated.totalCount / pageSize));

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="font-bold text-3xl tracking-tight">
            Listado de Presupuestos
          </h2>
          <p className="text-muted-foreground text-sm">
            Gestiona y consulta todos los presupuestos generados.
          </p>
        </div>
        <Button asChild>
          <Link href={`/org/${orgSlug}/presupuestos/nuevo`}>
            + Nuevo Presupuesto
          </Link>
        </Button>
      </div>

      <QuotesMetrics metrics={metrics} />

      <QuotesTable
        data={paginated.data}
        orgSlug={orgSlug}
        pageCount={pageCount}
      />
    </div>
  );
}
