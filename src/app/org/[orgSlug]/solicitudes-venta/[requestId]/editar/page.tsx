import { notFound } from "next/navigation";
import { SalesQuoteRequestBackButton } from "@/components/sales-quote-requests/sales-quote-request-back-button";
import { SalesQuoteRequestForm } from "@/components/sales-quote-requests/sales-quote-request-form";
import { requireAuth } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getVisibleCustomersByOrgSlug } from "@/modules/customers/service/customers.service";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getPriceLevelsByOrgSlug } from "@/modules/price-levels/service/price-levels.service";
import { getSaleProducts } from "@/modules/sales/service/sales.service";
import { getSalesPriceListsByOrgSlug } from "@/modules/sales-price-lists/service/sales-price-lists.service";
import { getOwnSalesQuoteRequestForEdit } from "@/modules/sales-quote-requests/service/my-sales-quote-requests.service";

type EditSalesQuoteRequestPageProps = {
  params: Promise<{ orgSlug: string; requestId: string }>;
};

export default async function EditSalesQuoteRequestPage({
  params,
}: EditSalesQuoteRequestPageProps) {
  const { orgSlug, requestId } = await params;
  await guardOrganizationPermissionAccess(orgSlug, [
    "sales.manage",
    "sales.manage.all",
  ]);
  const auth = await requireAuth();
  if (!auth) {
    notFound();
  }

  const initialValues = await getOwnSalesQuoteRequestForEdit({
    orgSlug,
    userId: auth.userId,
    requestId,
  });
  if (!initialValues) {
    notFound();
  }

  const [organization, customers, products, priceLevels, salesPriceLists] =
    await Promise.all([
      getOrganizationBySlug(orgSlug),
      getVisibleCustomersByOrgSlug(orgSlug),
      getSaleProducts(orgSlug),
      getPriceLevelsByOrgSlug(orgSlug),
      getSalesPriceListsByOrgSlug(orgSlug),
    ]);
  if (!organization?.id) {
    notFound();
  }

  const productIds = products
    .filter((product) => product.hasVariants)
    .map((product) => product.id);
  const supabase = await createClient();
  const { data: variants, error } = productIds.length
    ? await supabase
        .from("product_variants")
        .select("id, product_id, talle, color")
        .eq("organization_id", organization.id)
        .eq("is_active", true)
        .in("product_id", productIds)
    : { data: [], error: null };
  if (error) {
    throw new Error(`No se pudieron cargar las variantes: ${error.message}`);
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex min-w-0 items-center gap-3">
        <SalesQuoteRequestBackButton
          href={`/org/${orgSlug}/solicitudes-venta`}
          iconOnly
        />
        <div className="min-w-0">
          <h1 className="font-heading text-2xl">Editar cotización</h1>
          <p className="text-muted-foreground text-sm">
            Corregí los productos o precios. Al guardar, la cotización vuelve a
            aprobación.
          </p>
        </div>
      </div>
      <SalesQuoteRequestForm
        customers={customers}
        initialValues={initialValues}
        orgSlug={orgSlug}
        priceLevels={priceLevels.filter((level) => level.status === "Active")}
        products={products}
        requestId={requestId}
        salesPriceLists={salesPriceLists.filter(
          (list) => list.status === "Active"
        )}
        variants={(variants ?? []).map((variant) => ({
          id: variant.id,
          productId: variant.product_id,
          talle: variant.talle,
          color: variant.color,
        }))}
      />
    </div>
  );
}
