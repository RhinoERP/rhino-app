import { z } from "zod";
import { truncateMoney } from "@/lib/decimal";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { createClient } from "@/lib/supabase/server";
import { getVisibleCustomersByOrgSlug } from "@/modules/customers/service/customers.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { calculateSalePrice } from "@/modules/price-levels/service/price-calculator";
import { getPriceLevelsByOrgSlug } from "@/modules/price-levels/service/price-levels.service";
import { convertPriceToQuoteCurrency } from "@/modules/quotes/utils/currency-conversion";
import { getSaleProducts } from "@/modules/sales/service/sales.service";
import type { SaleProduct } from "@/modules/sales/types";
import { getSalesPriceListsByOrgSlug } from "@/modules/sales-price-lists/service/sales-price-lists.service";
import { buildItemizedTaxPlan } from "@/modules/taxes/item-tax-calculations";
import {
  calculateCompetitivePriceSuggestion,
  type SalesQuotePricingMethod,
} from "../competitive-pricing";

const itemInputSchema = z.object({
  productId: z.string().uuid(),
  productVariantId: z.string().uuid().nullable().optional(),
  quantity: z.number().finite().positive(),
  pricingMethod: z.enum(["COMPETITOR", "PERCENTAGE", "LIST_PRICE"]),
  competitorUnitPrice: z.number().finite().nonnegative(),
  agreedUnitPrice: z.number().finite().nonnegative().optional(),
  discountPercentage: z.number().finite().min(0).max(100).optional(),
  comment: z.string().trim().max(1000).optional().default(""),
});

export const createSalesQuoteRequestSchema = z.object({
  orgSlug: z.string().min(1),
  customerId: z.string().uuid(),
  customerSegment: z.enum(["ACTIVE", "NEW", "REACTIVATED"]),
  sellerZone: z.string().trim().min(1).max(120),
  currency: z.enum(["ARS", "USD"]),
  exchangeRate: z.number().finite().positive().nullable().optional(),
  priceLevelId: z.string().uuid().nullable().optional(),
  salesPriceListId: z.string().uuid().nullable().optional(),
  paymentMethod: z.string().trim().max(120).optional().default(""),
  paymentTerm: z.string().trim().max(120).optional().default(""),
  invoiceType: z.enum([
    "NOTA_DE_VENTA",
    "FACTURA_A",
    "FACTURA_A_RETENCION",
    "FACTURA_B",
    "FACTURA_C",
    "FACTURA_E",
  ]),
  observations: z.string().trim().max(4000).optional().default(""),
  items: z.array(itemInputSchema).min(1),
});

export type CreateSalesQuoteRequestInput = z.input<
  typeof createSalesQuoteRequestSchema
>;

type VariantRow = {
  id: string;
  product_id: string;
  talle: string;
  color: string;
};

type RequestLineSnapshot = {
  line_number: number;
  product_id: string;
  product_variant_id: string | null;
  product_name_snapshot: string;
  sku_snapshot: string;
  unit_of_measure_snapshot: string;
  product_currency_snapshot: string;
  quantity: number;
  pricing_method: SalesQuotePricingMethod;
  base_unit_price: number;
  competitor_unit_price: number;
  agreed_unit_price: number;
  discount_percentage: number;
  discount_amount: number;
  price_increase_amount: number;
  adjustment_type: string;
  unit_cost_snapshot: number | null;
  line_subtotal: number;
  taxes_snapshot: Record<string, string | number | null>[];
  product_comment: string;
};

function mapRequestLine(params: {
  item: CreateSalesQuoteRequestInput["items"][number];
  index: number;
  product: SaleProduct;
  variant: VariantRow | null;
  baseUnitPrice: number;
  unitCost: number | null;
  taxSnapshots: Record<string, string | number | null>[];
}): RequestLineSnapshot {
  const suggestion = calculateLinePricing(params.item, params.baseUnitPrice);
  const lineSubtotal = truncateMoney(
    suggestion.agreedUnitPrice * params.item.quantity
  );

  return {
    line_number: params.index + 1,
    product_id: params.product.id,
    product_variant_id: params.variant?.id ?? null,
    product_name_snapshot: params.variant
      ? `${params.product.name} - ${params.variant.talle} / ${params.variant.color}`
      : params.product.name,
    sku_snapshot: params.product.sku,
    unit_of_measure_snapshot: params.product.unitOfMeasure,
    product_currency_snapshot: params.product.currency,
    quantity: params.item.quantity,
    pricing_method: params.item.pricingMethod,
    base_unit_price: params.baseUnitPrice,
    competitor_unit_price: suggestion.competitorUnitPrice,
    agreed_unit_price: suggestion.agreedUnitPrice,
    discount_percentage: suggestion.discountPercentage,
    discount_amount: truncateMoney(
      suggestion.discountAmount * params.item.quantity
    ),
    price_increase_amount: truncateMoney(
      suggestion.priceIncreaseAmount * params.item.quantity
    ),
    adjustment_type: suggestion.adjustmentType,
    unit_cost_snapshot: params.unitCost,
    line_subtotal: lineSubtotal,
    taxes_snapshot: params.taxSnapshots,
    product_comment: params.item.comment ?? "",
  };
}

function calculateLinePricing(
  item: CreateSalesQuoteRequestInput["items"][number],
  baseUnitPrice: number
) {
  if (item.pricingMethod === "COMPETITOR") {
    return calculateCompetitivePriceSuggestion(
      baseUnitPrice,
      item.competitorUnitPrice,
      item.agreedUnitPrice
    );
  }
  if (item.agreedUnitPrice == null) {
    throw new Error("Ingresá el precio final de cada producto");
  }
  if (item.pricingMethod === "PERCENTAGE" && item.discountPercentage == null) {
    throw new Error("Ingresá el porcentaje de descuento");
  }
  return calculateCompetitivePriceSuggestion(
    baseUnitPrice,
    baseUnitPrice,
    item.agreedUnitPrice
  );
}

function prepareRequestLine(params: {
  item: CreateSalesQuoteRequestInput["items"][number];
  index: number;
  productsById: Map<string, SaleProduct>;
  variantsById: Map<string, VariantRow>;
  currency: string;
  exchangeRate: number | null | undefined;
  priceLevel:
    | Awaited<ReturnType<typeof getPriceLevelsByOrgSlug>>[number]
    | null;
  priceList:
    | Awaited<ReturnType<typeof getSalesPriceListsByOrgSlug>>[number]
    | null;
}) {
  const { item, index, productsById, variantsById, currency, exchangeRate } =
    params;
  const product = productsById.get(item.productId);
  if (!product) {
    throw new Error("Uno de los productos ya no está disponible");
  }
  const variant = item.productVariantId
    ? (variantsById.get(item.productVariantId) ?? null)
    : null;
  if (product.hasVariants && !variant) {
    throw new Error(`Seleccioná una variante para ${product.name}`);
  }
  if (variant && variant.product_id !== product.id) {
    throw new Error("La variante no corresponde al producto seleccionado");
  }
  if (!product.hasVariants && item.productVariantId) {
    throw new Error("El producto seleccionado no admite variantes");
  }
  if (product.currency !== currency && (!exchangeRate || exchangeRate <= 0)) {
    throw new Error(
      `Ingresá el tipo de cambio para cotizar ${product.name} en ${currency}`
    );
  }

  const { price: priceInProductCurrency } = calculateSalePrice({
    basePrice: product.price,
    costPrice: product.costPrice,
    level: params.priceLevel,
    adjustments: params.priceList
      ? [{ type: params.priceList.type, value: params.priceList.value }]
      : [],
  });
  const baseUnitPrice = convertPriceToQuoteCurrency(
    priceInProductCurrency,
    product.currency,
    currency,
    exchangeRate
  );
  const unitCost =
    product.costPrice == null
      ? null
      : convertPriceToQuoteCurrency(
          product.costPrice,
          product.currency,
          currency,
          exchangeRate
        );

  return { item, index, product, variant, baseUnitPrice, unitCost };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validates access, catalog ownership, pricing and fiscal snapshots before creating a request.
export async function createSalesQuoteRequest(
  rawInput: CreateSalesQuoteRequestInput,
  createdBy: string,
  requestId?: string
): Promise<string> {
  const input = createSalesQuoteRequestSchema.parse(rawInput);
  const [organization, customers, products, priceLevels, salesPriceLists] =
    await Promise.all([
      getOrganizationBySlug(input.orgSlug),
      getVisibleCustomersByOrgSlug(input.orgSlug),
      getSaleProducts(input.orgSlug),
      getPriceLevelsByOrgSlug(input.orgSlug),
      getSalesPriceListsByOrgSlug(input.orgSlug),
    ]);

  if (!organization?.id) {
    throw new Error("Organización no encontrada");
  }

  const customer = customers.find(
    (candidate) => candidate.id === input.customerId && candidate.is_active
  );
  if (!customer) {
    throw new Error("El cliente no está disponible para este vendedor");
  }

  const selectedLevel = input.priceLevelId
    ? (priceLevels.find(
        (level) => level.id === input.priceLevelId && level.status === "Active"
      ) ?? null)
    : null;
  if (input.priceLevelId && !selectedLevel) {
    throw new Error("El nivel de precios seleccionado no está disponible");
  }

  const selectedPriceList = input.salesPriceListId
    ? (salesPriceLists.find(
        (list) => list.id === input.salesPriceListId && list.status === "Active"
      ) ?? null)
    : null;
  if (input.salesPriceListId && !selectedPriceList) {
    throw new Error("La lista de precios seleccionada no está disponible");
  }

  const supabase = await createClient();
  const productIds = Array.from(
    new Set(input.items.map((item) => item.productId))
  );
  const { data: variants, error: variantsError } = await supabase
    .from("product_variants")
    .select("id, product_id, talle, color")
    .eq("organization_id", organization.id)
    .eq("is_active", true)
    .in("product_id", productIds);
  if (variantsError) {
    throw new Error(
      `No se pudieron validar las variantes: ${variantsError.message}`
    );
  }
  const variantsById = new Map(
    ((variants ?? []) as VariantRow[]).map((variant) => [variant.id, variant])
  );
  const productsById = new Map(
    products.map((product) => [product.id, product])
  );

  const lines = input.items.map((item, index) =>
    prepareRequestLine({
      item,
      index,
      productsById,
      variantsById,
      currency: input.currency,
      exchangeRate: input.exchangeRate,
      priceLevel: selectedLevel,
      priceList: selectedPriceList,
    })
  );

  const lineSubtotals = lines.map((line) =>
    truncateMoney(
      calculateLinePricing(line.item, line.baseUnitPrice).agreedUnitPrice *
        line.item.quantity
    )
  );
  const subtotalAmount = truncateMoney(
    lineSubtotals.reduce((sum, lineSubtotal) => sum + lineSubtotal, 0)
  );
  const taxPlan = buildItemizedTaxPlan({
    globalDiscountAmount: 0,
    lines: lines.map((line, index) => ({
      lineId: `line-${index + 1}`,
      productId: line.product.id,
      netAmount: lineSubtotals[index],
      taxes: line.product.taxes,
    })),
  });
  const lineSnapshots = lines.map((line) => {
    const taxSnapshots = taxPlan.itemTaxes
      .filter((tax) => tax.lineId === `line-${line.index + 1}`)
      .map((tax) => ({
        tax_id: tax.taxId,
        name: tax.name,
        rate: tax.rate,
        base_amount: truncateMoney(tax.baseAmount),
        tax_amount: truncateMoney(tax.taxAmount),
        tax_code_snapshot: tax.taxCodeSnapshot,
        source: tax.source,
      }));
    return mapRequestLine({ ...line, taxSnapshots });
  });
  const taxAmount = truncateMoney(taxPlan.totalTaxAmount);
  const totalAmount = truncateMoney(subtotalAmount + taxAmount);

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user || authData.user.id !== createdBy) {
    throw new Error("No se pudo validar el usuario que crea la solicitud");
  }
  const adminClient = createAdminClient() as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<{
      data: string | null;
      error: { message: string } | null;
    }>;
  };
  const userName =
    authData.user.user_metadata?.full_name ??
    authData.user.user_metadata?.name ??
    authData.user.email ??
    "Vendedor";
  const requestSnapshot = {
    organization_id: organization.id,
    customer_id: customer.id,
    created_by: createdBy,
    seller_user_id: createdBy,
    seller_name_snapshot: userName,
    seller_zone_snapshot: input.sellerZone,
    customer_segment: input.customerSegment,
    currency: input.currency,
    exchange_rate: input.exchangeRate ?? null,
    price_level_id: input.priceLevelId ?? null,
    sales_price_list_id: input.salesPriceListId ?? null,
    payment_method: input.paymentMethod,
    payment_term: input.paymentTerm,
    invoice_type: input.invoiceType,
    subtotal_amount: subtotalAmount,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    seller_observations: input.observations,
  };
  let createdRequestId: string | null = null;
  let error: { message: string } | null = null;
  if (requestId) {
    const userClient = supabase as unknown as {
      rpc: (
        name: string,
        args: Record<string, unknown>
      ) => Promise<{ error: { message: string } | null }>;
    };
    ({ error } = await userClient.rpc("update_own_sales_quote_request", {
      p_request_id: requestId,
      p_request: requestSnapshot,
      p_items: lineSnapshots,
    }));
  } else {
    const result = await adminClient.rpc("create_sales_quote_request", {
      p_request: requestSnapshot,
      p_items: lineSnapshots,
    });
    createdRequestId = result.data;
    error = result.error;
  }

  if (error || !(requestId || createdRequestId)) {
    throw new Error(
      `No se pudo enviar la solicitud: ${error?.message ?? "Error desconocido"}`
    );
  }
  return requestId ?? createdRequestId ?? "";
}

export async function updateSalesQuoteRequest(
  requestId: string,
  rawInput: CreateSalesQuoteRequestInput,
  updatedBy: string
): Promise<void> {
  await createSalesQuoteRequest(rawInput, updatedBy, requestId);
}
