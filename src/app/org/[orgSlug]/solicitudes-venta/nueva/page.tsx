import { notFound } from "next/navigation";
import { SalesQuoteRequestForm } from "@/components/sales-quote-requests/sales-quote-request-form";
import { createClient } from "@/lib/supabase/server";
import { getVisibleCustomersByOrgSlug } from "@/modules/customers/service/customers.service";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getPriceLevelsByOrgSlug } from "@/modules/price-levels/service/price-levels.service";
import { getSaleProducts } from "@/modules/sales/service/sales.service";
import { getSalesPriceListsByOrgSlug } from "@/modules/sales-price-lists/service/sales-price-lists.service";
import { getClientQuoteDraft } from "@/modules/sales-quote-requests/service/client-quote-drafts.service";

type NewSalesQuoteRequestPageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ draft?: string }>;
};

export default async function NewSalesQuoteRequestPage({
  params,
  searchParams,
}: NewSalesQuoteRequestPageProps) {
  const { orgSlug } = await params;
  const { draft: draftId } = await searchParams;
  await guardOrganizationPermissionAccess(orgSlug, [
    "sales.manage",
    "sales.manage.all",
  ]);

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
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    notFound();
  }
  const draft = draftId
    ? await getClientQuoteDraft(orgSlug, authData.user.id, draftId)
    : null;
  if (draftId && (!draft || draft.approval_request_id)) {
    notFound();
  }
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
      <div className="min-w-0">
        <h1 className="font-heading text-2xl">Cotizador competitivo</h1>
        <p className="text-muted-foreground text-sm">
          Prepará una cotización para el cliente y compartí el PDF. Cuando esté
          lista, convertí el borrador en petición de aprobación.
        </p>
      </div>
      <SalesQuoteRequestForm
        customers={customers}
        initialDraft={
          draft ? { id: draft.id, values: draft.quote_payload } : undefined
        }
        organizationId={organization.id}
        orgSlug={orgSlug}
        ownerUserId={authData.user.id}
        priceLevels={priceLevels.filter((level) => level.status === "Active")}
        products={products}
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
