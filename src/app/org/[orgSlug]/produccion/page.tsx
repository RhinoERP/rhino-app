import { redirect } from "next/navigation";
import { ProductionOrdersList } from "@/components/orders/production-orders-list";
import { getOrdersAction } from "@/modules/orders/actions/get-orders.action";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type ProductionPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default async function ProductionPage({ params }: ProductionPageProps) {
  const { orgSlug } = await params;

  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) {
    redirect("/");
  }

  const allOrders = await getOrdersAction(orgSlug);
  const orders = allOrders.filter((o) =>
    ["IN_PRODUCTION", "DESIGN_REVIEW"].includes(o.status)
  );

  return (
    <div className="flex-1 space-y-6 p-4 pt-6 md:p-8">
      <div>
        <h1 className="font-bold text-3xl tracking-tight">
          Producción y Diseño
        </h1>
        <p className="text-muted-foreground text-sm">
          Gestioná los bocetos de personalización y preparación de prendas.
        </p>
      </div>
      <ProductionOrdersList orders={orders} orgSlug={orgSlug} />
    </div>
  );
}
