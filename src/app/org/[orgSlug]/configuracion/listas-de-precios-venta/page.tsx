import { redirect } from "next/navigation";

type SalesPriceListsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function SalesPriceListsPage({
  params,
}: SalesPriceListsPageProps) {
  const { orgSlug } = await params;
  redirect(`/org/${orgSlug}/precios/listas-de-precios-venta`);
}
