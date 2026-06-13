import { PricingGridDataTable } from "@/components/price-lists/pricing-grid-data-table";

type PageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function VentaMayoristaPage({ params }: PageProps) {
  const { orgSlug } = await params;
  return <PricingGridDataTable mode="wholesale" orgSlug={orgSlug} />;
}
