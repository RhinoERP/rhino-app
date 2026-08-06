import { PricingGridDataTable } from "@/components/price-lists/pricing-grid-data-table";
import { getCategoriesByOrgSlug } from "@/modules/categories/service/categories.service";

type PageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function VentaMayoristaPage({ params }: PageProps) {
  const { orgSlug } = await params;

  const categories = await getCategoriesByOrgSlug(orgSlug);

  const categoryOptions = categories.map((c) => ({
    id: c.id,
    name: c.name,
  }));

  return (
    <PricingGridDataTable
      categories={categoryOptions}
      mode="wholesale"
      orgSlug={orgSlug}
    />
  );
}
