import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Proveedores</h1>
          <p className="text-muted-foreground text-sm">
            Consulta todos los proveedores de la organización.
          </p>
        </div>
        <AddSupplierDialog orgSlug={orgSlug} />
      </div>
      <SuppliersDataTable orgSlug={orgSlug} />
    </div>
  );
}
