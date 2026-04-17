import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { DirectSaleDetail } from "@/components/pos-sales/direct-sale-detail";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getDirectSaleById } from "@/modules/sales/service/direct-sales.service";

type DirectSaleDetailPageProps = {
  params: Promise<{
    orgSlug: string;
    saleId: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function DirectSaleDetailPage({
  params,
}: DirectSaleDetailPageProps) {
  noStore();

  const { orgSlug, saleId } = await params;
  const [sale, organization] = await Promise.all([
    getDirectSaleById(orgSlug, saleId),
    getOrganizationBySlug(orgSlug),
  ]);

  if (!sale) {
    notFound();
  }

  return (
    <DirectSaleDetail
      company={{
        name: organization?.name ?? "Empresa",
        cuit: organization?.cuit ?? "No informado",
        address: "Dirección no informada",
      }}
      orgSlug={orgSlug}
      sale={sale}
    />
  );
}
