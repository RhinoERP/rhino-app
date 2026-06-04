import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { DirectSaleDetail } from "@/components/pos-sales/direct-sale-detail";
import {
  getDirectSaleConfigByOrgSlug,
  getOrganizationBySlug,
} from "@/modules/organizations/service/organizations.service";
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
  const [sale, organization, directSaleConfig] = await Promise.all([
    getDirectSaleById(orgSlug, saleId),
    getOrganizationBySlug(orgSlug),
    getDirectSaleConfigByOrgSlug(orgSlug),
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
      directSaleDefaultInvoiceType={directSaleConfig.sales_default_invoice_type}
      orgSlug={orgSlug}
      posArcaInvoiceType={
        directSaleConfig.sales_default_invoice_type === "FACTURA_B" ||
        directSaleConfig.sales_default_invoice_type === "FACTURA_C"
          ? directSaleConfig.sales_default_invoice_type
          : null
      }
      sale={sale}
    />
  );
}
