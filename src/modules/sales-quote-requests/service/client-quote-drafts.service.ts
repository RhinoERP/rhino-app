import { truncateMoney } from "@/lib/decimal";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { createClient } from "@/lib/supabase/server";
import { getVisibleCustomersByOrgSlug } from "@/modules/customers/service/customers.service";
import { formatCaseUnitQuantity } from "@/modules/inventory/utils/case-units";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getPriceLevelsByOrgSlug } from "@/modules/price-levels/service/price-levels.service";
import { getSaleProducts } from "@/modules/sales/service/sales.service";
import { getSalesPriceListsByOrgSlug } from "@/modules/sales-price-lists/service/sales-price-lists.service";
import { renderClientQuoteHTML } from "../client-quote-document";
import { calculateQuoteTaxes } from "../client-quote-taxes";
import {
  type CreateSalesQuoteRequestInput,
  calculateLinePricing,
  createSalesQuoteRequest,
  createSalesQuoteRequestSchema,
  prepareRequestLine,
} from "./sales-quote-requests.service";

export type ClientQuoteDraft = {
  id: string;
  customer_name_snapshot: string;
  currency: string;
  total_amount: number;
  quote_payload: CreateSalesQuoteRequestInput;
  pdf_html: string;
  approval_request_id: string | null;
  updated_at: string;
};

// The new table is intentionally server-only until the migration is reviewed and
// Supabase types are regenerated for the target environment.
function draftsTable() {
  return createAdminClient().from("sales_quote_client_drafts" as never);
}

function assertDraftDatabaseError(error: { message: string } | null) {
  if (error) {
    throw new Error(`No se pudo guardar el borrador: ${error.message}`);
  }
}

export async function listClientQuoteDrafts(
  orgSlug: string,
  userId: string
): Promise<ClientQuoteDraft[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const { data, error } = await draftsTable()
    .select(
      "id, customer_name_snapshot, currency, total_amount, approval_request_id, updated_at"
    )
    .eq("organization_id", org.id)
    .eq("created_by", userId)
    .is("approval_request_id", null)
    .order("updated_at", { ascending: false });
  // Keep the existing requests list available until this additive migration is deployed.
  if (error?.code === "42P01" || error?.code === "PGRST205") {
    return [];
  }
  assertDraftDatabaseError(error);
  return (data ?? []) as unknown as ClientQuoteDraft[];
}

export async function getClientQuoteDraft(
  orgSlug: string,
  userId: string,
  draftId: string
): Promise<ClientQuoteDraft | null> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const { data, error } = await draftsTable()
    .select(
      "id, customer_name_snapshot, currency, total_amount, quote_payload, pdf_html, approval_request_id, updated_at"
    )
    .eq("id", draftId)
    .eq("organization_id", org.id)
    .eq("created_by", userId)
    .maybeSingle();
  assertDraftDatabaseError(error);
  return data as unknown as ClientQuoteDraft | null;
}

async function prepareClientQuote(raw: CreateSalesQuoteRequestInput) {
  const parsed = createSalesQuoteRequestSchema.parse(raw);
  const now = new Date();
  const quote = {
    ...parsed,
    preparedOn:
      parsed.preparedOn ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
  };
  const [org, customers, products, levels, priceLists, supabase] =
    await Promise.all([
      getOrganizationBySlug(quote.orgSlug),
      getVisibleCustomersByOrgSlug(quote.orgSlug),
      getSaleProducts(quote.orgSlug),
      getPriceLevelsByOrgSlug(quote.orgSlug),
      getSalesPriceListsByOrgSlug(quote.orgSlug),
      createClient(),
    ]);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const customer = customers.find(
    (item) => item.id === quote.customerId && item.is_active
  );
  if (!customer) {
    throw new Error("El cliente no está disponible");
  }
  const selectedLevel = quote.priceLevelId
    ? levels.find(
        (level) => level.id === quote.priceLevelId && level.status === "Active"
      )
    : null;
  if (quote.priceLevelId && !selectedLevel) {
    throw new Error("El nivel de precios seleccionado no está disponible");
  }
  const selectedPriceList = quote.salesPriceListId
    ? priceLists.find(
        (list) => list.id === quote.salesPriceListId && list.status === "Active"
      )
    : null;
  if (quote.salesPriceListId && !selectedPriceList) {
    throw new Error("La lista de precios seleccionada no está disponible");
  }
  const { data: variants, error: variantsError } = await supabase
    .from("product_variants")
    .select("id, product_id, talle, color")
    .eq("organization_id", org.id)
    .eq("is_active", true)
    .in("product_id", [...new Set(quote.items.map((item) => item.productId))]);
  if (variantsError) {
    throw new Error(
      `No se pudieron validar las variantes: ${variantsError.message}`
    );
  }
  const productsById = new Map(
    products.map((product) => [product.id, product])
  );
  const variantsById = new Map(
    (variants ?? []).map((variant) => [variant.id, variant])
  );
  const lines = quote.items.map((item, index) => {
    const { product, variant, baseUnitPrice } = prepareRequestLine({
      item,
      index,
      productsById,
      variantsById,
      currency: quote.currency,
      exchangeRate: quote.exchangeRate,
      priceLevel: selectedLevel ?? null,
      priceList: selectedPriceList ?? null,
    });
    if (item.agreedUnitPrice == null) {
      throw new Error("Completá el precio acordado antes de guardar");
    }
    const agreedUnitPrice = calculateLinePricing(
      item,
      baseUnitPrice,
      product.unitOfMeasure === "CAJA"
    ).agreedUnitPrice;
    const netAmount = truncateMoney(agreedUnitPrice * item.quantity);
    return {
      lineId: `line-${index + 1}`,
      productId: product.id,
      netAmount,
      taxes: product.taxes,
      name: variant
        ? `${product.name} - ${variant.talle} / ${variant.color}`
        : product.name,
      quantity: item.quantity,
      quantityLabel:
        product.unitOfMeasure === "CAJA" && product.unitsPerBox
          ? formatCaseUnitQuantity(item.quantity, product.unitsPerBox)
          : `${item.quantity} ${item.sellingUnit === "CAJAS" ? "cajas" : product.unitOfMeasure}`,
      unitPrice: agreedUnitPrice,
    };
  });
  const totals = calculateQuoteTaxes(lines, quote.additionalTaxes);
  const html = renderClientQuoteHTML({
    organizationName: org.name,
    customerName: customer.fantasy_name || customer.business_name,
    preparedOn: quote.preparedOn.split("-").reverse().join("/"),
    currency: quote.currency,
    paymentMethod: quote.paymentMethod,
    paymentTerm: quote.paymentTerm,
    observations: quote.observations,
    lines: lines.map((line) => ({
      name: line.name,
      quantityLabel: line.quantityLabel,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      subtotal: line.netAmount,
    })),
    taxes: totals.taxBreakdown,
    additionalTaxes: quote.additionalTaxes,
    subtotal: totals.subtotal,
    taxAmount: totals.taxAmount,
    total: totals.total,
  });
  return { quote, org, customer, html, total: totals.total };
}

export async function saveClientQuoteDraft(
  raw: CreateSalesQuoteRequestInput,
  userId: string,
  draftId?: string
): Promise<{ id: string; html: string }> {
  const { quote, org, customer, html, total } = await prepareClientQuote(raw);
  const record = {
    organization_id: org.id,
    created_by: userId,
    customer_id: customer.id,
    customer_name_snapshot: customer.fantasy_name || customer.business_name,
    currency: quote.currency,
    total_amount: total,
    quote_payload: quote,
    pdf_html: html,
    updated_at: new Date().toISOString(),
  };
  if (draftId) {
    const { data: updated, error: updateError } = await draftsTable()
      .update(record as never)
      .eq("id", draftId)
      .eq("organization_id", org.id)
      .eq("created_by", userId)
      .is("approval_request_id", null)
      .select("id")
      .maybeSingle();
    assertDraftDatabaseError(updateError);
    if (!updated) {
      throw new Error("El borrador no existe o ya se envió a aprobación");
    }
    return { id: draftId, html };
  }
  const { data, error } = await draftsTable()
    .insert(record as never)
    .select("id")
    .single();
  assertDraftDatabaseError(error);
  if (!data) {
    throw new Error("No se pudo crear el borrador");
  }
  return { id: (data as { id: string }).id, html };
}

export async function convertClientQuoteDraft(
  orgSlug: string,
  userId: string,
  draftId: string
): Promise<string> {
  const draft = await getClientQuoteDraft(orgSlug, userId, draftId);
  if (!draft) {
    throw new Error("Borrador no encontrado");
  }
  if (draft.approval_request_id) {
    return draft.approval_request_id;
  }
  const values = createSalesQuoteRequestSchema.parse(draft.quote_payload);
  if (values.orgSlug !== orgSlug) {
    throw new Error("La organización del borrador no coincide");
  }
  const current = await prepareClientQuote(values);
  if (current.total !== draft.total_amount || current.html !== draft.pdf_html) {
    throw new Error(
      "La cotización cambió desde que se generó el PDF. Revisá los precios e impuestos y guardá nuevamente el borrador antes de enviarlo a aprobación."
    );
  }
  // The draft UUID also serves as the retry-safe idempotency key.
  const requestId = await createSalesQuoteRequest(
    values,
    userId,
    undefined,
    draft.id
  );
  const { error } = await draftsTable()
    .update({ approval_request_id: requestId } as never)
    .eq("id", draftId)
    .eq("created_by", userId);
  assertDraftDatabaseError(error);
  return requestId;
}
