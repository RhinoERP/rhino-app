import { getSuppliersByOrgSlug } from "@/modules/proveedores/service/suppliers.service";
import { SuppliersTable } from "./suppliers-table";

type SuppliersPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function SuppliersPage({ params }: SuppliersPageProps) {
  const { orgSlug } = await params;
  const suppliers = await getSuppliersByOrgSlug(orgSlug);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Proveedores</h1>
        <p className="text-muted-foreground text-sm">
          Consulta todos los proveedores de la organización.
        </p>
      </div>
      <SuppliersTable orgSlug={orgSlug} suppliers={suppliers} />
    </div>
  );
}
