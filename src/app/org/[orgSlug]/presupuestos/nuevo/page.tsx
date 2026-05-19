import { notFound } from "next/navigation";
import { QuoteForm } from "@/components/quotes/quote-form";
import { getCustomersByOrgSlug } from "@/modules/customers/service/customers.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { isOrganizationModuleEnabled } from "@/modules/organizations/utils/module-flags";
import type { QuoteFormValues } from "@/modules/quotes/types";
import { getSaleProducts } from "@/modules/sales/service/sales.service";

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
  const [organization, customers, products] = await Promise.all([
    getOrganizationBySlug(orgSlug),
    getCustomersByOrgSlug(orgSlug),
    getSaleProducts(orgSlug),
  ]);

  if (
    !(organization && isOrganizationModuleEnabled(organization, "production"))
  ) {
    notFound();
  }

  // Definimos la función para cuando el formulario haga submit.
  // Como aún no tenemos la mutación en base de datos, simplemente
  // mockearemos el guardado para demostrar el flujo en consola.
  const handleSubmit = async (values: QuoteFormValues) => {
    "use server";
    console.log("Presupuesto enviado:", values);
    // En el futuro, aquí iría la llamada al servicio/mutation:
    // await createQuoteAction(orgSlug, values);
  };

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="font-bold text-3xl tracking-tight">Nuevo Presupuesto</h2>
      </div>

      <QuoteForm
        customers={customers}
        onSubmit={handleSubmit}
        orgSlug={orgSlug}
        products={products}
      />
    </div>
  );
}
