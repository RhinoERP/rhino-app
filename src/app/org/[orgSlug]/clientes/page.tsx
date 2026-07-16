import { AddCustomerDialog } from "@/components/customers/add-customer-dialog";
import { getCustomersPaginated } from "@/modules/customers/service/customers.service";
import type { SortParam } from "@/modules/customers/types";
import { CustomersDataTable } from "./data-table";

type CustomersPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
  searchParams: Promise<{
    page?: string;
    perPage?: string;
    sort?: string;
    search?: string;
    status?: string;
    sellerId?: string;
  }>;
};

export default async function CustomersPage({
  params,
  searchParams,
}: CustomersPageProps) {
  const { orgSlug } = await params;
  const sp = await searchParams;

  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(sp.perPage) || 10));
  const search = sp.search || undefined;
  const status = sp.status || "active";
  const sellerId = sp.sellerId || undefined;

  let sort: SortParam[] | undefined;
  if (sp.sort) {
    try {
      sort = JSON.parse(sp.sort);
    } catch {
      sort = undefined;
    }
  }

  const paginated = await getCustomersPaginated(orgSlug, {
    page,
    pageSize,
    sort,
    search,
    status,
    sellerId,
  });

  const pageCount = Math.max(1, Math.ceil(paginated.totalCount / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-heading text-2xl">Clientes</h1>
          <p className="text-muted-foreground text-sm">
            Consulta todos los clientes de la organización.
          </p>
        </div>
        <div className="w-full md:w-auto">
          <AddCustomerDialog orgSlug={orgSlug} />
        </div>
      </div>
      <CustomersDataTable
        customers={paginated.data}
        orgSlug={orgSlug}
        pageCount={pageCount}
      />
    </div>
  );
}
