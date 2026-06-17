import { PricingGridDataTable } from "@/components/price-lists/pricing-grid-data-table";
import { getCategoriesByOrgSlug } from "@/modules/categories/service/categories.service";
import { getSuppliers } from "@/modules/inventory/service/inventory.service";

type PageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function VentaDirectaPage({ params }: PageProps) {
  const { orgSlug } = await params;

  const [categories, suppliers] = await Promise.all([
    getCategoriesByOrgSlug(orgSlug),
    getSuppliers(orgSlug),
  ]);

  const categoryOptions = categories.map((c) => ({
    id: c.id,
    name: c.name,
  }));

  return (
    <PricingGridDataTable
      categories={categoryOptions}
      mode="direct"
      orgSlug={orgSlug}
      suppliers={suppliers}
    />
  );
}
