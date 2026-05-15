import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { DirectSaleDetail } from "@/components/pos-sales/direct-sale-detail";
import {
  getDirectSaleById,
  getDirectSaleFiscalTicketData,
} from "@/modules/sales/service/direct-sales.service";

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
  const [sale, fiscalTicketData] = await Promise.all([
    getDirectSaleById(orgSlug, saleId),
    getDirectSaleFiscalTicketData(orgSlug, saleId),
  ]);

  if (!sale) {
    notFound();
  }

  return (
    <DirectSaleDetail
      company={
        fiscalTicketData?.company ?? {
          name: "Empresa",
          cuit: "No informado",
        }
      }
      orgSlug={orgSlug}
      sale={sale}
    />
  );
}
