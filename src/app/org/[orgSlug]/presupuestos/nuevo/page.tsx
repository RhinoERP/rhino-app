import { notFound } from "next/navigation";
import { getCustomersByOrgSlug } from "@/modules/customers/service/customers.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { isOrganizationModuleEnabled } from "@/modules/organizations/utils/module-flags";
import { getSaleProducts } from "@/modules/sales/service/sales.service";
import { getSalesPriceListsByOrgSlug } from "@/modules/sales-price-lists/service/sales-price-lists.service";
import { NewQuoteFormWrapper } from "./quote-form-wrapper";

type NewQuotePageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function NewQuotePage({ params }: NewQuotePageProps) {
  const { orgSlug } = await params;

  // Obtenemos los datos necesarios para renderizar el formulario:
  // - Clientes
  // - Productos (con precios de la vista DB)
  // - Listas de precios de venta
  const [organization, customers, products, salesPriceLists] =
    await Promise.all([
      getOrganizationBySlug(orgSlug),
      getCustomersByOrgSlug(orgSlug),
      getSaleProducts(orgSlug),
      getSalesPriceListsByOrgSlug(orgSlug),
    ]);

  if (
    !(organization && isOrganizationModuleEnabled(organization, "production"))
  ) {
    notFound();
  }

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="font-bold text-3xl tracking-tight">Nuevo Presupuesto</h2>
      </div>

      <NewQuoteFormWrapper
        customers={customers}
        orgSlug={orgSlug}
        products={products}
        salesPriceLists={salesPriceLists}
      />
    </div>
  );
}
