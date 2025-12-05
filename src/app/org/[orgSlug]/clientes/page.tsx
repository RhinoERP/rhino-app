import { Suspense } from "react";
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { getCustomersByOrgSlug } from "@/modules/customers/service/customers.service";
import { CustomersDataTable } from "./data-table";

type CustomersPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function CustomersPage({ params }: CustomersPageProps) {
  const { orgSlug } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Clientes</h1>
        <p className="text-muted-foreground text-sm">
          Consulta todos los clientes de la organización.
        </p>
      </div>
      <Suspense
        fallback={
          <DataTableSkeleton
            columnCount={5}
            filterCount={1}
            rowCount={8}
            shrinkZero={false}
          />
        }
      >
        <CustomerTableWrapper orgSlug={orgSlug} />
      </Suspense>
    </div>
  );
}

async function CustomerTableWrapper({ orgSlug }: { orgSlug: string }) {
  const customers = await getCustomersByOrgSlug(orgSlug);

  return <CustomersDataTable data={customers} orgSlug={orgSlug} />;
}
