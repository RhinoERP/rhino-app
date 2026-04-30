import { Suspense } from "react";
import { AddCustomerDialog } from "@/components/customers/add-customer-dialog";
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
      <Suspense>
        <CustomersDataTable orgSlug={orgSlug} />
      </Suspense>
    </div>
  );
}
