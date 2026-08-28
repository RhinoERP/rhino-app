import { ArrowLeft } from "lucide-react";
import Link from "next/dist/client/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getQuoteCustomersByOrgSlug } from "@/modules/customers/service/customers.service";
import {
  guardOrganizationModuleAccess,
  guardOrganizationPermissionAccess,
} from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
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

  await guardOrganizationModuleAccess(orgSlug, "production");
  await guardOrganizationPermissionAccess(orgSlug, [
    ...READ_PERMISSIONS.sales,
    "quotes.manage",
    "quotes.manage.all",
  ]);

  // Obtenemos los datos necesarios para renderizar el formulario:
  // - Clientes
  // - Productos (con precios de la vista DB)
  // - Listas de precios de venta
  const [organization, customers, products, salesPriceLists] =
    await Promise.all([
      getOrganizationBySlug(orgSlug),
      getQuoteCustomersByOrgSlug(orgSlug),
      getSaleProducts(orgSlug),
      getSalesPriceListsByOrgSlug(orgSlug),
    ]);

  if (!organization) {
    notFound();
  }

  return (
    <div className="flex-1 space-y-4 p-2 pt-6">
      <div className="flex gap-5 space-y-2">
        <div className="flex items-center justify-center gap-4">
          <Button asChild size="icon" variant="ghost">
            <Link href={`/org/${orgSlug}/listas-de-presupuestos`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        </div>
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
