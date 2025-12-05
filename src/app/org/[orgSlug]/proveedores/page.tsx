import { Suspense } from "react";
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { getSuppliersByOrgSlug } from "@/modules/suppliers/service/suppliers.service";
import { SuppliersDataTable } from "./data-table";

type SuppliersPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function SuppliersPage({ params }: SuppliersPageProps) {
  const { orgSlug } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Proveedores</h1>
        <p className="text-muted-foreground text-sm">
          Consulta todos los proveedores de la organización.
        </p>
      </div>
      <Suspense
        fallback={
          <DataTableSkeleton columnCount={4} filterCount={1} rowCount={8} />
        }
      >
        <SupplierTableWrappper orgSlug={orgSlug} />
      </Suspense>
    </div>
  );
}

async function SupplierTableWrappper({ orgSlug }: { orgSlug: string }) {
  const suppliers = await getSuppliersByOrgSlug(orgSlug);

  return <SuppliersDataTable data={suppliers} orgSlug={orgSlug} />;
}
