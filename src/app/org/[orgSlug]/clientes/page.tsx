import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { AddCustomerDialog } from "@/components/customers/add-customer-dialog";
import { getQueryClient } from "@/lib/get-query-client";
import { getCustomersByOrgSlug } from "@/modules/customers/service/customers.service";
import type { Customer } from "@/modules/customers/types";
import { CustomersDataTable } from "./data-table";

type CustomersPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function CustomersPage({ params }: CustomersPageProps) {
  const { orgSlug } = await params;
  const queryClient = getQueryClient();

  await queryClient.prefetchQuery<Customer[]>({
    queryKey: ["org", orgSlug, "customers"],
    queryFn: () => getCustomersByOrgSlug(orgSlug),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Clientes</h1>
          <p className="text-muted-foreground text-sm">
            Consulta todos los clientes de la organización.
          </p>
        </div>
        <AddCustomerDialog orgSlug={orgSlug} />
      </div>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <CustomersDataTable orgSlug={orgSlug} />
      </HydrationBoundary>
    </div>
  );
}
