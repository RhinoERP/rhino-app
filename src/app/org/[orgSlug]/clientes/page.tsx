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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Clientes</h1>
          <p className="text-muted-foreground text-sm">
            Consulta todos los clientes de la organización.
          </p>
        </div>
        <AddCustomerDialog orgSlug={orgSlug} />
      </div>
      <CustomersDataTable orgSlug={orgSlug} />
    </div>
  );
}
