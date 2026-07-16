import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
import { getSuppliersPaginated } from "@/modules/suppliers/service/suppliers.service";
import type { SortParam } from "@/modules/suppliers/types";
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
  const sp = await searchParams;

  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(sp.perPage) || 10));
  const search = sp.search || undefined;

  let sort: SortParam[] | undefined;
  if (sp.sort) {
    try {
      sort = JSON.parse(sp.sort);
    } catch {
      sort = undefined;
    }
  }

  const result = await getSuppliersPaginated(orgSlug, {
    page,
    pageSize,
    sort,
    search,
  });

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
      <SuppliersDataTable
        data={result.data}
        orgSlug={orgSlug}
        pageCount={pageCount}
      />
    </div>
  );
}
