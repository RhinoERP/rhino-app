import { PricingGridDataTable } from "@/components/price-lists/pricing-grid-data-table";

type PageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function VentaDirectaPage({ params }: PageProps) {
  const { orgSlug } = await params;
  return <PricingGridDataTable mode="direct" orgSlug={orgSlug} />;
}
