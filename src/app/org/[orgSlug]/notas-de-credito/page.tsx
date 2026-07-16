import { CreateCreditNoteDialog } from "@/components/credit-notes/create-credit-note-dialog";
import { PurchaseTargetCreditNoteDialog } from "@/components/credit-notes/purchase-target-credit-note-dialog";
import { getCreditNotesPaginated } from "@/modules/credit-notes/service/credit-notes.service";
import type { SortParam } from "@/modules/credit-notes/types";
import { getCustomersByOrgSlug } from "@/modules/customers/service/customers.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  getSalesAccessContext,
  getSalesOrdersByOrgSlug,
} from "@/modules/sales/service/sales.service";
import { getSuppliersByOrgSlug } from "@/modules/suppliers/service/suppliers.service";
import { CreditNotesDataTable } from "./data-table";

type CreditNotesPageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{
    page?: string;
    perPage?: string;
    sort?: string;
    search?: string;
    status?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function CreditNotesPage({
  params,
  searchParams,
}: CreditNotesPageProps) {
  const { orgSlug } = await params;
  const sp = await searchParams;

  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(sp.perPage) || 20));
  const search = sp.search || undefined;
  const status = sp.status || undefined;

  let sort: SortParam[] | undefined;
  if (sp.sort) {
    try {
      sort = JSON.parse(sp.sort);
    } catch {
      sort = undefined;
    }
  }

  const [paginated, sales, accessContext, org, customers, suppliers] =
    await Promise.all([
      getCreditNotesPaginated(orgSlug, {
        page,
        pageSize,
        sort,
        search,
        status,
      }),
      getSalesOrdersByOrgSlug(orgSlug),
      getSalesAccessContext(orgSlug),
      getOrganizationBySlug(orgSlug),
      getCustomersByOrgSlug(orgSlug),
      getSuppliersByOrgSlug(orgSlug),
    ]);

  const pageCount = Math.max(1, Math.ceil(paginated.totalCount / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-heading text-2xl">Notas de Crédito</h1>
          <p className="text-muted-foreground text-sm">
            Documentos de crédito emitidos a clientes por devoluciones o
            ajustes.
          </p>
        </div>
        {accessContext.canManage && (
          <div className="flex flex-wrap gap-2">
            <PurchaseTargetCreditNoteDialog
              customers={customers}
              orgSlug={orgSlug}
            />
            <CreateCreditNoteDialog
              customers={customers}
              orgSlug={orgSlug}
              sales={sales}
              supplierDifferentiatedCredits={
                org?.supplier_differentiated_credits ?? false
              }
              suppliers={suppliers}
            />
          </div>
        )}
      </div>

      <CreditNotesDataTable
        data={paginated.data}
        orgSlug={orgSlug}
        pageCount={pageCount}
      />
    </div>
  );
}
