import { notFound } from "next/navigation";
import {
  parseDateRangeFilter,
  parseSearchParams,
} from "@/lib/parse-search-params";
import { getCustomersByOrgSlug } from "@/modules/customers/service/customers.service";
import {
  getOrganizationMembersWithUsersAdmin,
  getOrganizationSalesMembersBySlug,
} from "@/modules/organizations/service/members.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getSalesAccessContext } from "@/modules/sales/service/sales.service";
import { getSalesAdvancesPaginated } from "@/modules/sales-advances/service/sales-advances.service";
import { SalesAdvancesDataTable } from "./data-table";

type SalesAdvancesPageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{
    page?: string;
    perPage?: string;
    sort?: string;
    search?: string;
    view?: string;
    status?: string;
    cliente?: string;
    vendedor?: string;
    created_at?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function SalesAdvancesPage({
  params,
  searchParams,
}: SalesAdvancesPageProps) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const [org, access] = await Promise.all([
    getOrganizationBySlug(orgSlug),
    getSalesAccessContext(orgSlug),
  ]);
  if (!org || org.sales_advances_enabled === false || !access.canRead) {
    notFound();
  }

  const { page, pageSize, search, sort } = parseSearchParams(sp, 20);
  const [paginated, customers, sellers] = await Promise.all([
    getSalesAdvancesPaginated(orgSlug, {
      page,
      pageSize,
      sort,
      search,
      view: sp.view === "ALL" ? "ALL" : "ACTIVE",
      status: sp.status as never,
      customerId: sp.cliente || undefined,
      sellerId: sp.vendedor || undefined,
      createdAt: parseDateRangeFilter(sp.created_at),
    }),
    getCustomersByOrgSlug(orgSlug),
    access.canViewAll
      ? getOrganizationMembersWithUsersAdmin(orgSlug)
      : getOrganizationSalesMembersBySlug(orgSlug),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Anticipos</h1>
        <p className="text-muted-foreground text-sm">
          Seguimiento de emisión, cobro y liquidación de anticipos de clientes.
        </p>
      </div>
      <SalesAdvancesDataTable
        customerOptions={customers.map((customer) => ({
          id: customer.id,
          name:
            (customer as { fantasy_name?: string | null }).fantasy_name ??
            (customer as { business_name?: string | null }).business_name ??
            customer.id,
        }))}
        data={paginated.data}
        orgSlug={orgSlug}
        pageCount={Math.max(1, Math.ceil(paginated.totalCount / pageSize))}
        sellerOptions={sellers
          .filter((member) => member.user_id)
          .map((member) => ({
            id: member.user_id,
            name: member.user?.name ?? member.user?.email ?? member.user_id,
          }))}
      />
    </div>
  );
}
