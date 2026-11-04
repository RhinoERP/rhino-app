import { z } from "zod";
import { prepareWhatsAppPreSaleOrder } from "@/modules/sales/service/sales.service";
import { computeAverageQuantityPerUnit } from "@/modules/sales/utils/quantity-per-unit";
import {
  preSaleFollowUpMessage,
  readCommercialGuidance,
} from "../commercial-guidance";
import { assertWhatsAppEnabled } from "./access";
import { getEffectiveCommercialConfiguration } from "./commercial-configuration";
import { isExplicitConfirmation } from "./confirmation";
import {
  isAmbiguousReturn,
  isPurchaseRequest,
  isRepeatRequest,
} from "./order-policy";
import { throwIfWhatsAppSchemaError } from "./order-schema";
import { isLocalSimulatorIntegration } from "./simulation";
import { createWhatsAppAdminClient } from "./supabase-admin";

export const commercialToolNames = [
  "find_customer_by_phone",
  "search_catalog",
  "get_offer",
  "get_recommendations",
  "get_commercial_state",
  "get_conversation_history",
  "list_pre_sales",
  "start_order",
  "request_new_order",
  "request_cart_abandonment",
  "abandon_cart",
  "remove_cart_item",
  "repeat_order",
  "accept_repeat_changes",
  "request_pre_sale_selection",
  "select_pre_sale",
  "cancel_pending_action",
  "render_order_response",
  "get_cart",
  "upsert_cart_item",
  "quote_cart",
  "create_pre_sale",
  "get_pre_sale_status",
  "handoff_to_human",
] as const;

export type CommercialToolName = (typeof commercialToolNames)[number];

export type CommercialToolContext = {
  organizationId: string;
  integrationId: string;
  conversationId: string;
  sourceMessageId: string;
  mode?: "LOCAL_SIMULATOR";
  jobId?: string;
  leaseToken?: string;
};

type VerifiedContext = CommercialToolContext & {
  customerPhone: string;
  customerId: string | null;
  currentPreSaleId: string | null;
  salesPriceListId: string;
  responsibleUserId: string;
  handoffMessage: string | null;
  source: { id: string; content: string | null; created_at: string };
  pendingAction: Record<string, unknown> | null;
  timezone: string;
  automationResumedAt: string | null;
  commercialGuidance: ReturnType<typeof readCommercialGuidance>;
  conversationStatus: string;
};

type CartItem = {
  id: string;
  product_id: string;
  product_variant_id: string | null;
  quantity: number;
  unit_price: number;
  price_snapshot: Record<string, unknown> | null;
};

const identifier = z.string().uuid();
const nonDigit = /\D/g;
const searchWhitespace = /\s+/;
const trailingPlural = /s$/u;
const ignoredSearchTerms = new Set([
  "a",
  "al",
  "con",
  "de",
  "del",
  "el",
  "la",
  "las",
  "lo",
  "los",
  "para",
  "por",
  "un",
  "una",
  "y",
]);

const cartVersion = {
  cart_id: identifier,
  version: z.number().int().positive(),
};
const page = { offset: z.number().int().min(0).max(10_000).default(0) };
const toolSchemas = {
  get_commercial_state: z.object({}).strict(),
  get_conversation_history: z.object(page).strict(),
  list_pre_sales: z.object(page).strict(),
  start_order: z.object({}).strict(),
  request_new_order: z.object({}).strict(),
  request_cart_abandonment: z
    .object({
      ...cartVersion,
      replace: z.boolean(),
      repeat_pre_sale_id: identifier.nullable().optional(),
    })
    .strict(),
  abandon_cart: z.object(cartVersion).strict(),
  remove_cart_item: z.object({ ...cartVersion, item_id: identifier }).strict(),
  repeat_order: z.object({ pre_sale_id: identifier }).strict(),
  accept_repeat_changes: z.object(cartVersion).strict(),
  request_pre_sale_selection: z
    .object({
      pre_sale_ids: z.array(identifier).min(2).max(20),
      purpose: z.enum(["STATUS", "REPEAT", "HANDOFF"]),
    })
    .strict(),
  select_pre_sale: z.object({ pre_sale_id: identifier }).strict(),
  cancel_pending_action: z.object({}).strict(),
  render_order_response: z.object({ text: z.string().max(12_000) }).strict(),
  find_customer_by_phone: z.object({}).strict(),
  search_catalog: z
    .object({ query: z.string().trim().min(2).max(120) })
    .strict(),
  get_offer: z.object({ product_id: identifier }).strict(),
  get_recommendations: z
    .object({
      query: z.string().trim().min(2).max(120).nullable().default(null),
      related_product_id: identifier.nullable().default(null),
    })
    .strict(),
  get_cart: z.object({}).strict(),
  upsert_cart_item: z
    .object({
      ...cartVersion,
      product_id: identifier,
      product_variant_id: identifier.nullable().optional(),
      quantity: z.number().positive().max(10_000),
      quantity_kind: z.enum(["SALE_UNIT", "PIECE"]).nullable().optional(),
    })
    .strict(),
  quote_cart: z.object(cartVersion).strict(),
  create_pre_sale: z.object(cartVersion).strict(),
  get_pre_sale_status: z
    .object({ pre_sale_id: identifier.nullable().optional() })
    .strict(),
  handoff_to_human: z
    .object({ reason: z.string().trim().min(2).max(500) })
    .strict(),
} satisfies Record<CommercialToolName, z.ZodType>;

function normalizedPhone(value: string | null): string {
  return (value ?? "").replace(nonDigit, "");
}

function normalizedSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/(\d)(kg|gr|g|lt|l|ml|unidades|unidad|un)\b/gu, "$1 $2")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function searchTokens(value: string): string[] {
  return [
    ...new Set(
      normalizedSearch(value)
        .split(searchWhitespace)
        .map((term) =>
          term.length > 3 ? term.replace(trailingPlural, "") : term
        )
        .filter((term) => term.length > 1 && !ignoredSearchTerms.has(term))
    ),
  ].slice(0, 8);
}

function catalogMatchScore(
  product: {
    name: string | null;
    sku: string | null;
    description: string | null;
    brand: string | null;
    unit_of_measure: string | null;
    categoryName: string;
  },
  query: string,
  terms: string[]
): number {
  const fields = [
    product.name,
    product.sku,
    product.description,
    product.brand,
    product.unit_of_measure,
    product.categoryName,
  ].map((value) => normalizedSearch(value ?? ""));
  const matchedTerms = terms.filter((term) =>
    fields.some((field) => field.includes(term))
  );
  if (!matchedTerms.length) {
    return 0;
  }

  const normalizedQuery = normalizedSearch(query);
  const phraseMatch = fields.some((field) => field.includes(normalizedQuery));
  const nameMatch = normalizedSearch(product.name ?? "").includes(
    normalizedQuery
  );
  return (
    matchedTerms.length * 10 +
    (matchedTerms.length === terms.length ? 40 : 0) +
    (phraseMatch ? 30 : 0) +
    (nameMatch ? 20 : 0)
  );
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function verifyCommercialLease(
  supabase: ReturnType<typeof createWhatsAppAdminClient>,
  context: CommercialToolContext
): Promise<void> {
  if (context.jobId || context.leaseToken) {
    if (!(context.jobId && context.leaseToken)) {
      throw new Error("Falta la exclusión del trabajo comercial.");
    }
    const lease = await supabase.rpc("assert_whatsapp_job_lease", {
      p_job_id: context.jobId,
      p_lease_token: context.leaseToken,
      p_conversation_id: context.conversationId,
      p_source_message_id: context.sourceMessageId,
    });
    if (lease.error || !lease.data) {
      throw new Error(
        "El trabajo comercial perdió su exclusión. No se ejecutó la herramienta."
      );
    }
  }
}

async function verifyContext(
  context: CommercialToolContext,
  allowHandoff = false
): Promise<VerifiedContext> {
  await assertWhatsAppEnabled(
    context.organizationId,
    context.mode === "LOCAL_SIMULATOR" ? "whatsapp_sandbox" : "whatsapp"
  );
  const supabase = createWhatsAppAdminClient();
  await verifyCommercialLease(supabase, context);
  const [
    { data: integration, error: integrationError },
    { data: conversation, error: conversationError },
  ] = await Promise.all([
    supabase
      .from("whatsapp_integrations")
      .select(
        "id, organization_id, phone_number_id, status, sales_price_list_id, responsible_user_id, handoff_message, business_hours, commercial_rules"
      )
      .eq("id", context.integrationId)
      .eq("organization_id", context.organizationId)
      .maybeSingle(),
    supabase
      .from("whatsapp_conversations")
      .select(
        "id, organization_id, integration_id, status, customer_phone, customer_id, current_pre_sale_id, pending_order_action, automation_resumed_at"
      )
      .eq("id", context.conversationId)
      .eq("organization_id", context.organizationId)
      .eq("integration_id", context.integrationId)
      .in("status", allowHandoff ? ["ACTIVE", "HANDOFF"] : ["ACTIVE"])
      .maybeSingle(),
  ]);

  throwIfWhatsAppSchemaError(integrationError);
  throwIfWhatsAppSchemaError(conversationError);

  const isSimulator =
    context.mode === "LOCAL_SIMULATOR" &&
    integration?.status === "DRAFT" &&
    isLocalSimulatorIntegration(integration.phone_number_id) &&
    conversation?.customer_phone.startsWith("SIMULACIÓN LOCAL · ");
  if (
    integrationError ||
    conversationError ||
    !(integration && conversation) ||
    (context.mode === "LOCAL_SIMULATOR"
      ? !isSimulator
      : integration.status !== "ACTIVE" ||
        isLocalSimulatorIntegration(integration.phone_number_id))
  ) {
    throw new Error("La conversación no está disponible para automatización");
  }
  if (!(integration.sales_price_list_id && integration.responsible_user_id)) {
    throw new Error("La integración comercial está incompleta");
  }

  const { data: source, error: sourceError } = await supabase
    .from("whatsapp_messages")
    .select("id, content, created_at")
    .eq("id", context.sourceMessageId)
    .eq("organization_id", context.organizationId)
    .eq("integration_id", context.integrationId)
    .eq("conversation_id", context.conversationId)
    .eq("direction", "INBOUND")
    .single();
  if (sourceError || !source) {
    throw new Error("El mensaje no está disponible para automatización");
  }
  const configuration = await getEffectiveCommercialConfiguration(
    context.organizationId,
    integration,
    isSimulator
  );
  return {
    ...context,
    source,
    automationResumedAt: conversation.automation_resumed_at,
    pendingAction: conversation.pending_order_action,
    timezone:
      configuration.business_hours?.timezone ||
      "America/Argentina/Buenos_Aires",
    customerPhone: conversation.customer_phone,
    customerId: conversation.customer_id,
    currentPreSaleId: conversation.current_pre_sale_id,
    salesPriceListId: integration.sales_price_list_id,
    responsibleUserId: integration.responsible_user_id,
    handoffMessage: configuration.handoff_message ?? null,
    commercialGuidance: readCommercialGuidance(configuration.commercial_rules),
    conversationStatus: conversation.status,
  };
}

async function resolvePrice(params: {
  organizationId: string;
  priceListId: string;
  productId: string;
}) {
  const supabase = createWhatsAppAdminClient();
  const [
    { data: product, error: productError },
    { data: priceList, error: priceListError },
  ] = await Promise.all([
    supabase
      .from("products_with_price")
      .select("id, name, sku, calculated_sale_price, currency, is_active")
      .eq("id", params.productId)
      .eq("organization_id", params.organizationId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("sales_price_lists")
      .select("id, name, type, value, percentage, is_active, valid_from")
      .eq("id", params.priceListId)
      .eq("organization_id", params.organizationId)
      .maybeSingle(),
  ]);

  if (productError || !product) {
    throw new Error("El producto no está disponible para la venta");
  }
  if (priceListError || !priceList?.is_active) {
    throw new Error("La lista de precios de WhatsApp no está disponible");
  }
  if (priceList.valid_from > new Date().toISOString().slice(0, 10)) {
    throw new Error("La lista de precios de WhatsApp aún no está vigente");
  }

  const basePrice = Number(product.calculated_sale_price ?? 0);
  const type = priceList.type ?? "PERCENTAGE";
  const value = Number(
    priceList.value ?? (type === "PERCENTAGE" ? priceList.percentage : 0) ?? 0
  );
  const unitPrice =
    type === "PRICE"
      ? roundMoney(Math.max(0, basePrice + value))
      : roundMoney(Math.max(0, basePrice * (1 + value / 100)));

  return {
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    currency: product.currency ?? "ARS",
    unitPrice,
    priceList: { id: priceList.id, name: priceList.name },
  };
}

type CartVersion = { cart_id: string; version: number };
type Cart = {
  id: string;
  status: string;
  version: number;
  currency: string;
  quote_snapshot: { fingerprint: string; total: number } | null;
  updated_at: string;
};

async function mutate(
  context: VerifiedContext,
  operation: string,
  expected?: CartVersion,
  payload: unknown = {}
) {
  const { data, error } = await createWhatsAppAdminClient().rpc(
    "mutate_whatsapp_order",
    {
      p_organization_id: context.organizationId,
      p_integration_id: context.integrationId,
      p_conversation_id: context.conversationId,
      p_source_message_id: context.sourceMessageId,
      p_operation: operation,
      p_cart_id: expected?.cart_id ?? null,
      p_version: expected?.version ?? null,
      p_payload: payload,
    }
  );
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

async function cartSummary(context: VerifiedContext) {
  const supabase = createWhatsAppAdminClient();
  const { data: cart, error: cartError } = await supabase
    .from("conversation_carts")
    .select("id, status, version, currency, quote_snapshot, updated_at")
    .eq("conversation_id", context.conversationId)
    .eq("organization_id", context.organizationId)
    .in("status", ["OPEN", "QUOTED", "CONFIRMED"])
    .maybeSingle();
  if (cartError) {
    throw new Error(cartError.message);
  }
  if (!cart) {
    return { cart: null, items: [] };
  }
  const { data: items, error } = await supabase
    .from("conversation_cart_items")
    .select(
      "id, product_id, product_variant_id, quantity, unit_price, price_snapshot"
    )
    .eq("cart_id", cart.id)
    .eq("organization_id", context.organizationId)
    .order("created_at")
    .order("id");
  if (error) {
    throw new Error(error.message);
  }
  return {
    cart: cart as Cart,
    items: ((items ?? []) as CartItem[]).map((item) => ({
      id: item.id,
      productId: item.product_id,
      productVariantId: item.product_variant_id,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      subtotal: roundMoney(Number(item.quantity) * Number(item.unit_price)),
      productName: String(item.price_snapshot?.productName ?? "Producto"),
      sku: item.price_snapshot?.sku ?? null,
      unitOfMeasure: item.price_snapshot?.unitOfMeasure ?? null,
      requestedPieces:
        typeof item.price_snapshot?.requestedPieces === "number"
          ? item.price_snapshot.requestedPieces
          : null,
      quantityEstimated: item.price_snapshot?.quantityEstimated === true,
    })),
  };
}

async function expectedCart(context: VerifiedContext, expected: CartVersion) {
  const state = await cartSummary(context);
  if (
    !state.cart ||
    state.cart.id !== expected.cart_id ||
    state.cart.version !== expected.version
  ) {
    throw new Error(
      "El carrito cambió o terminó; consultá el estado comercial otra vez"
    );
  }
  return { ...state, cart: state.cart };
}

async function findCustomer(context: VerifiedContext) {
  const supabase = createWhatsAppAdminClient();
  if (context.customerId) {
    const { data: linkedCustomer } = await supabase
      .from("customers")
      .select("id, business_name, fantasy_name, phone, email")
      .eq("id", context.customerId)
      .eq("is_active", true)
      .eq("organization_id", context.organizationId)
      .maybeSingle();
    if (linkedCustomer) {
      return { found: true, customer: linkedCustomer };
    }
  }

  const phone = normalizedPhone(context.customerPhone);
  const { data, error } = await supabase
    .from("customers")
    .select("id, business_name, fantasy_name, phone, email")
    .eq("organization_id", context.organizationId)
    .eq("is_active", true)
    .ilike("phone", `%${phone}%`)
    .limit(5);
  if (error) {
    throw new Error(`No se pudo buscar el cliente: ${error.message}`);
  }
  const customer = (
    (data ?? []) as Array<{ id: string; phone: string | null }>
  ).find((candidate) => normalizedPhone(candidate.phone) === phone);
  if (!customer) {
    return { found: false, customer: null };
  }

  const { error: updateError } = await supabase
    .from("whatsapp_conversations")
    .update({ customer_id: customer.id })
    .eq("id", context.conversationId)
    .eq("organization_id", context.organizationId)
    .eq("integration_id", context.integrationId);
  if (updateError) {
    throw new Error(`No se pudo vincular el cliente: ${updateError.message}`);
  }
  return { found: true, customer };
}

async function searchCatalog(context: VerifiedContext, query: string) {
  const terms = searchTokens(query);
  if (!terms.length) {
    throw new Error("La búsqueda debe incluir al menos dos caracteres");
  }
  const supabase = createWhatsAppAdminClient();
  const { data: categories, error: categoriesError } = await supabase
    .from("categories")
    .select("id, name")
    .eq("organization_id", context.organizationId);
  if (categoriesError) {
    throw new Error(
      `No se pudieron buscar categorías: ${categoriesError.message}`
    );
  }

  const categoryNames = new Map(
    ((categories ?? []) as Array<{ id: string; name: string }>).map(
      (category) => [category.id, category.name]
    )
  );
  const matchingCategoryIds = [...categoryNames.entries()]
    .filter(([, name]) => {
      const categoryTokens = searchTokens(name);
      return terms.some((term) => categoryTokens.includes(term));
    })
    .map(([id]) => id);
  // unit_of_measure is a PostgreSQL enum in products_with_price. It can be
  // used to rank the returned rows, but PostgREST cannot apply ILIKE to it.
  const productFields = ["name", "sku", "description", "brand"];
  const textFilters = terms.flatMap((term) =>
    productFields.map((field) => `${field}.ilike.%${term}%`)
  );
  const baseQuery = () =>
    supabase
      .from("products_with_price")
      .select(
        "id, name, sku, description, brand, category_id, currency, unit_of_measure"
      )
      .eq("organization_id", context.organizationId)
      .eq("is_active", true)
      .limit(100);
  const [{ data: textProducts, error: textError }, categoryProductsResult] =
    await Promise.all([
      baseQuery().or(textFilters.join(",")),
      matchingCategoryIds.length
        ? baseQuery().in("category_id", matchingCategoryIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (textError) {
    throw new Error(`No se pudo buscar el catálogo: ${textError.message}`);
  }
  if (categoryProductsResult.error) {
    throw new Error(
      `No se pudo buscar el catálogo: ${categoryProductsResult.error.message}`
    );
  }

  type CatalogRow = {
    id: string | null;
    name: string | null;
    sku: string | null;
    description: string | null;
    brand: string | null;
    category_id: string | null;
    currency: string | null;
    unit_of_measure: string | null;
  };
  const candidates = new Map<string, CatalogRow>();
  for (const product of [
    ...((textProducts ?? []) as CatalogRow[]),
    ...((categoryProductsResult.data ?? []) as CatalogRow[]),
  ]) {
    if (product.id) {
      candidates.set(product.id, product);
    }
  }
  const rankedProducts = [...candidates.values()]
    .map((product) => {
      const categoryName = product.category_id
        ? (categoryNames.get(product.category_id) ?? "")
        : "";
      return {
        product,
        categoryName,
        score: catalogMatchScore({ ...product, categoryName }, query, terms),
      };
    })
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        (left.product.name ?? "").localeCompare(right.product.name ?? "")
    )
    .slice(0, 8);

  return {
    products: rankedProducts.map(({ product, categoryName }) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      description: product.description,
      brand: product.brand,
      category: categoryName || null,
      unitOfMeasure: product.unit_of_measure,
      currency: product.currency ?? "ARS",
    })),
  };
}

async function getPieceStock(context: VerifiedContext, productId: string) {
  const lots: Array<{
    quantity_available: number | null;
    unit_quantity_available: number | null;
  }> = [];
  let offset = 0;
  while (true) {
    const { data, error } = await createWhatsAppAdminClient()
      .from("product_lots")
      .select("id, quantity_available, unit_quantity_available")
      .eq("organization_id", context.organizationId)
      .eq("product_id", productId)
      .order("id")
      .range(offset, offset + 999);
    if (error) {
      throw new Error("No se pudieron consultar las unidades disponibles");
    }
    lots.push(...(data ?? []));
    if (!data || data.length < 1000) {
      break;
    }
    offset += 1000;
  }
  if (!lots.length) {
    return { piecesAvailable: null, lotQuantity: null };
  }
  const allCountsKnown = lots.every(
    (lot) =>
      lot.unit_quantity_available !== null &&
      lot.unit_quantity_available !== undefined
  );
  return {
    piecesAvailable: allCountsKnown
      ? lots.reduce((sum, lot) => sum + Number(lot.unit_quantity_available), 0)
      : null,
    lotQuantity: lots.reduce(
      (sum, lot) => sum + Number(lot.quantity_available ?? 0),
      0
    ),
  };
}

async function getProductPresentation(
  context: VerifiedContext,
  productId: string
) {
  const { data: product, error } = await createWhatsAppAdminClient()
    .from("products")
    .select(
      "unit_of_measure, tracks_stock_units, weight_per_unit, units_per_box, description, brand"
    )
    .eq("organization_id", context.organizationId)
    .eq("id", productId)
    .eq("is_active", true)
    .single();
  if (error || !product) {
    throw new Error("No se pudo consultar la presentación del producto");
  }
  const unitOfMeasure = product.unit_of_measure ?? "UN";
  const weighted = ["KG", "LT"].includes(unitOfMeasure);
  const stock =
    product.tracks_stock_units && weighted
      ? await getPieceStock(context, productId)
      : { piecesAvailable: null, lotQuantity: null };
  const configuredReference =
    weighted && Number(product.weight_per_unit) > 0
      ? Number(product.weight_per_unit)
      : null;
  const approximateQuantityPerPiece =
    computeAverageQuantityPerUnit({
      unitOfMeasure,
      tracksStockUnits: Boolean(product.tracks_stock_units),
      weightPerUnit: product.weight_per_unit,
      totalUnits: stock.piecesAvailable,
      totalQuantity: stock.lotQuantity,
    }) ?? configuredReference;
  const referenceSource =
    Number(product.weight_per_unit) > 0 ? "PRODUCT" : "CURRENT_LOTS";
  return {
    unitOfMeasure,
    tracksStockUnits: Boolean(product.tracks_stock_units),
    approximateQuantityPerPiece,
    quantityPerPieceSource:
      approximateQuantityPerPiece === null ? null : referenceSource,
    piecesAvailable: stock.piecesAvailable,
    unitsPerBox: product.units_per_box ?? null,
    description: product.description ?? null,
    brand: product.brand ?? null,
  };
}

async function getOffer(context: VerifiedContext, productId: string) {
  const [offer, stockResult, presentation] = await Promise.all([
    resolvePrice({
      organizationId: context.organizationId,
      priceListId: context.salesPriceListId,
      productId,
    }),
    createWhatsAppAdminClient()
      .from("view_stock_detail")
      .select("total_stock, unit_of_measure")
      .eq("organization_id", context.organizationId)
      .eq("product_id", productId)
      .maybeSingle(),
    getProductPresentation(context, productId),
  ]);
  if (stockResult.error) {
    throw new Error(
      `No se pudo consultar el stock: ${stockResult.error.message}`
    );
  }
  return {
    ...offer,
    ...presentation,
    stockAvailable: stockResult.data?.total_stock ?? null,
  };
}

async function availableRecommendations(
  context: VerifiedContext,
  ranks: Array<{ product_id: string; order_count: number | string }>
) {
  const supabase = createWhatsAppAdminClient();
  const ids = ranks.map((rank) => rank.product_id);
  const [productsResult, stocksResult] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, description, brand")
      .eq("organization_id", context.organizationId)
      .eq("is_active", true)
      .in("id", ids),
    supabase
      .from("view_stock_detail")
      .select("product_id, total_stock")
      .eq("organization_id", context.organizationId)
      .in("product_id", ids),
  ]);
  if (productsResult.error || stocksResult.error) {
    throw new Error("No se pudieron consultar los productos recomendados");
  }
  const available = ranks
    .filter(
      (rank) =>
        productsResult.data?.some(
          (product) => product.id === rank.product_id
        ) &&
        stocksResult.data?.some(
          (stock) =>
            stock.product_id === rank.product_id &&
            Number(stock.total_stock) > 0
        )
    )
    .slice(0, 3);
  const offers = await Promise.all(
    available.map(async (rank) => ({
      ...(await getOffer(context, rank.product_id)),
      orderCount: Number(rank.order_count),
    }))
  );
  return offers.filter(
    (offer) => offer.stockAvailable !== null && Number(offer.stockAvailable) > 0
  );
}

async function getRecommendations(
  context: VerifiedContext,
  args: z.infer<typeof toolSchemas.get_recommendations>
) {
  const terms = args.query ? searchTokens(args.query) : null;
  if (terms && !terms.length) {
    return { products: [], periodDays: 90, evidence: "NO_CATALOG_MATCH" };
  }
  if (args.related_product_id) {
    // Validate the anchor in this tenant before requesting purchase evidence.
    await resolvePrice({
      organizationId: context.organizationId,
      priceListId: context.salesPriceListId,
      productId: args.related_product_id,
    });
  }
  const supabase = createWhatsAppAdminClient();
  const { data: ranked, error } = await supabase.rpc(
    "whatsapp_product_recommendations",
    {
      p_organization_id: context.organizationId,
      p_query: terms?.join(" ") ?? null,
      p_related_product_id: args.related_product_id,
    }
  );
  if (error) {
    throw new Error(
      "No se pudo verificar el historial de ventas. Recomendá sólo con características y precios comprobados; no afirmes popularidad."
    );
  }
  const ranks = (ranked ?? []) as Array<{
    product_id: string;
    order_count: number | string;
  }>;
  if (!ranks.length) {
    return { products: [], periodDays: 90, evidence: "NO_CONFIRMED_SALES" };
  }
  const recommendations = await availableRecommendations(context, ranks);
  return {
    products: recommendations,
    periodDays: 90,
    evidence: args.related_product_id
      ? "BOUGHT_TOGETHER"
      : "CONFIRMED_ORDER_FREQUENCY",
    scope: "THIS_ORGANIZATION",
    segment: null,
    // No customer details are exposed, and this metric is frequency, not units sold.
    requiresSegmentEvidence:
      "No permite afirmar que los compradores son distribuidores ni revelar quién compró.",
  };
}

async function upsertCartItem(
  context: VerifiedContext,
  args: z.infer<typeof toolSchemas.upsert_cart_item>
) {
  await expectedCart(context, args);
  const offer = await getOffer(context, args.product_id);
  const pieceRequest =
    args.quantity_kind === "PIECE" && offer.unitOfMeasure !== "UN";
  if (args.quantity_kind === "PIECE" && !Number.isInteger(args.quantity)) {
    throw new Error("Indicá una cantidad entera de piezas");
  }
  if (pieceRequest && !offer.approximateQuantityPerPiece) {
    throw new Error(
      "Falta un peso o volumen de referencia confiable por pieza. Preguntá qué cantidad en kilos o litros necesita; no inventes la conversión."
    );
  }
  const quantity = pieceRequest
    ? Math.round(
        args.quantity *
          (offer.approximateQuantityPerPiece as number) *
          1_000_000
      ) / 1_000_000
    : args.quantity;
  if (
    offer.stockAvailable !== null &&
    Number(offer.stockAvailable) < quantity
  ) {
    throw new Error("No hay disponibilidad suficiente para esa cantidad");
  }
  if (
    pieceRequest &&
    offer.piecesAvailable !== null &&
    args.quantity > offer.piecesAvailable
  ) {
    throw new Error("No hay suficientes piezas disponibles para esa cantidad");
  }
  await mutate(context, "UPSERT", args, {
    ...args,
    quantity,
    unit_price: offer.unitPrice,
    price_snapshot: {
      productName: offer.productName,
      sku: offer.sku,
      currency: offer.currency,
      priceListId: offer.priceList.id,
      unitOfMeasure: offer.unitOfMeasure,
      requestedPieces: pieceRequest ? args.quantity : null,
      quantityEstimated: pieceRequest,
    },
  });
  return cartSummary(context);
}

async function prepareQuote(context: VerifiedContext, expected: CartVersion) {
  const state = await expectedCart(context, expected);
  if (context.pendingAction?.kind === "REVIEW_REPEAT") {
    throw new Error(
      "Primero pedí confirmación sobre las diferencias del pedido repetido y usá accept_repeat_changes"
    );
  }
  if (!state.items.length) {
    throw new Error("El carrito está vacío");
  }
  const offers = await Promise.all(
    state.items.map((item) => getOffer(context, item.productId))
  );
  const issues = offers.flatMap((offer, index) => {
    const item = state.items[index];
    if (offer.currency !== state.cart.currency) {
      return [`${item.productName}: moneda distinta a la del carrito`];
    }
    if (
      offer.stockAvailable !== null &&
      Number(offer.stockAvailable) < item.quantity
    ) {
      return [`${item.productName}: disponibilidad insuficiente`];
    }
    if (item.requestedPieces !== null) {
      if (
        offer.piecesAvailable !== null &&
        item.requestedPieces > offer.piecesAvailable
      ) {
        return [`${item.productName}: cantidad de piezas insuficiente`];
      }
      if (
        !offer.approximateQuantityPerPiece ||
        Math.abs(
          item.quantity -
            item.requestedPieces * offer.approximateQuantityPerPiece
        ) > 0.000_001
      ) {
        return [
          `${item.productName}: cambió el peso de referencia; actualizá el ítem con la cantidad de piezas acordada y volvé a cotizar`,
        ];
      }
    }
    return [];
  });
  if (issues.length) {
    throw new Error(issues.join("; "));
  }
  const customer = await findCustomer(context);
  if (!(customer.found && customer.customer)) {
    throw new Error(
      "No se encontró un cliente asociado al teléfono; se necesita atención humana para continuar"
    );
  }
  const prepared = await prepareWhatsAppPreSaleOrder({
    organizationId: context.organizationId,
    conversationId: context.conversationId,
    sellerId: context.responsibleUserId,
    input: {
      orgSlug: "whatsapp-integration",
      customerId: customer.customer.id,
      saleDate: new Intl.DateTimeFormat("en-CA", {
        timeZone: context.timezone,
      }).format(new Date()),
      salesPriceListId: context.salesPriceListId,
      observations: `${context.mode === "LOCAL_SIMULATOR" ? "[SIMULACIÓN LOCAL] " : ""}Preventa originada por WhatsApp · conversación ${context.conversationId}${state.items.some((item) => item.quantityEstimated) ? " · Pesos e importes estimados, sujetos a pesaje y reconfirmación comercial" : ""}`,
      items: state.items.map((item, index) => ({
        productId: item.productId,
        productVariantId: item.productVariantId,
        description: item.quantityEstimated
          ? `${item.productName} (${item.requestedPieces} piezas, aprox. ${item.quantity} ${item.unitOfMeasure})`
          : item.productName,
        quantity:
          offers[index].tracksStockUnits &&
          ["KG", "LT"].includes(offers[index].unitOfMeasure ?? "")
            ? (item.requestedPieces ?? 0)
            : item.quantity,
        weightQuantity:
          offers[index].tracksStockUnits &&
          ["KG", "LT"].includes(offers[index].unitOfMeasure ?? "")
            ? item.quantity
            : null,
        unitPrice: offers[index].unitPrice,
        basePrice: offers[index].unitPrice,
        tracksStockUnits: offers[index].tracksStockUnits,
      })),
    },
  });
  // Exclude generated IDs/timestamps; compare all commercial amounts and taxes.
  const fingerprint = JSON.stringify({
    items: state.items.map((item, index) => [
      item.productId,
      item.productVariantId,
      item.quantity,
      offers[index].unitPrice,
      offers[index].currency,
      offers[index].stockAvailable,
      item.requestedPieces,
      item.quantityEstimated,
    ]),
    total: prepared.order.total_amount,
    taxes: prepared.taxes.map((tax) => [
      tax.tax_id,
      tax.rate,
      tax.base_amount,
      tax.tax_amount,
    ]),
  });
  return {
    state,
    prepared,
    fingerprint,
    total: Number(prepared.order.total_amount),
    items: state.items.map((item, index) => ({
      id: item.id,
      unit_price: offers[index].unitPrice,
      price_snapshot: {
        productName: offers[index].productName,
        sku: offers[index].sku,
        currency: offers[index].currency,
        unitOfMeasure: offers[index].unitOfMeasure,
        requestedPieces: item.requestedPieces,
        quantityEstimated: item.quantityEstimated,
      },
    })),
  };
}

async function quoteCart(context: VerifiedContext, expected: CartVersion) {
  const quote = await prepareQuote(context, expected);
  await mutate(context, "QUOTE", expected, {
    items: quote.items,
    snapshot: {
      fingerprint: quote.fingerprint,
      total: quote.total,
      quantityEstimated: quote.state.items.some(
        (item) => item.quantityEstimated
      ),
    },
  });
  return {
    ...(await cartSummary(context)),
    total: quote.total,
    requiresConfirmation: true,
  };
}

async function createPreSale(context: VerifiedContext, expected: CartVersion) {
  const { data: existing, error } = await createWhatsAppAdminClient()
    .from("sales_orders")
    .select("id")
    .eq("whatsapp_cart_id", expected.cart_id)
    .eq("conversation_id", context.conversationId)
    .eq("organization_id", context.organizationId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (existing) {
    return { preSaleId: existing.id, alreadyCreated: true };
  }
  if (
    !isExplicitConfirmation(context.source.content) ||
    context.pendingAction?.kind !== "CONFIRM_PRE_SALE"
  ) {
    throw new Error("Falta confirmar explícitamente esta cotización");
  }
  const quote = await prepareQuote(context, expected);
  if (quote.state.cart.quote_snapshot?.fingerprint !== quote.fingerprint) {
    await quoteCart(context, expected);
    return {
      created: false,
      reason:
        "La cotización cambió; presentá el total actualizado y pedí otra confirmación",
    };
  }
  return mutate(context, "CONVERT", expected, {
    ...quote.prepared,
    fingerprint: quote.fingerprint,
  });
}

async function listPreSales(context: VerifiedContext, offset: number) {
  const { data, error } = await createWhatsAppAdminClient()
    .from("sales_orders")
    .select(
      "id, sale_number, sale_date, created_at, status, preventa_status, total_amount, currency"
    )
    .eq("organization_id", context.organizationId)
    .eq("conversation_id", context.conversationId)
    .eq("source", "WHATSAPP")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + 19);
  if (error) {
    throw new Error(error.message);
  }
  return {
    preSales: data ?? [],
    nextOffset: data?.length === 20 ? offset + 20 : null,
  };
}

async function getPreSaleStatus(
  context: VerifiedContext,
  preSaleId?: string | null
) {
  const id = preSaleId || context.currentPreSaleId;
  if (!id) {
    return { preSale: null };
  }
  const { data, error } = await createWhatsAppAdminClient()
    .from("sales_orders")
    .select(
      "id, sale_number, sale_date, status, preventa_status, total_amount, currency"
    )
    .eq("id", id)
    .eq("organization_id", context.organizationId)
    .eq("conversation_id", context.conversationId)
    .eq("source", "WHATSAPP")
    .maybeSingle();
  if (error || !data) {
    throw new Error("No se encontró ese pedido en esta conversación");
  }
  return { preSale: data };
}

async function commercialState(context: VerifiedContext) {
  const state = await cartSummary(context);
  const { data: previous, error } = await createWhatsAppAdminClient()
    .from("whatsapp_messages")
    .select("created_at")
    .eq("organization_id", context.organizationId)
    .eq("integration_id", context.integrationId)
    .eq("conversation_id", context.conversationId)
    .eq("direction", "INBOUND")
    .neq("id", context.sourceMessageId)
    .lte("created_at", context.source.created_at)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  const localDay = (date: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: context.timezone }).format(
      new Date(date)
    );
  const returningAnotherDay = Boolean(
    previous &&
      localDay(previous.created_at) !== localDay(context.source.created_at)
  );
  const clarification =
    state.cart &&
    returningAnotherDay &&
    isAmbiguousReturn(context.source.content)
      ? "¿Seguimos con el pedido pendiente o querés empezar otro?"
      : null;
  return {
    ...state,
    clarification,
    lastPreSale: (await getPreSaleStatus(context)).preSale,
    pendingAction: context.pendingAction,
    sourceMessage: context.source,
    requiresFreshMessage: Boolean(
      context.automationResumedAt &&
        context.source.created_at <= context.automationResumedAt
    ),
    returningAnotherDay,
    commercialGuidance: context.commercialGuidance,
    localDateTime: new Intl.DateTimeFormat("es-AR", {
      timeZone: context.timezone,
      dateStyle: "full",
      timeStyle: "short",
    }).format(new Date()),
    timezone: context.timezone,
  };
}

type RepeatItem = {
  product_id: string | null;
  product_variant_id: string | null;
  quantity: number;
  unit_quantity?: number | null;
  unit_price: number;
  description: string | null;
};

function repeatedQuantities(
  item: RepeatItem,
  offer: Awaited<ReturnType<typeof getOffer>>
) {
  const hasWeight = Number(item.unit_quantity) > 0;
  const byPiece =
    hasWeight && Number(item.quantity) > 0 && offer.tracksStockUnits;
  const quantity =
    hasWeight && !byPiece ? Number(item.unit_quantity) : Number(item.quantity);
  let stockQuantity = quantity;
  if (byPiece) {
    if (!offer.approximateQuantityPerPiece) {
      throw new Error("peso por pieza desconocido");
    }
    if (offer.piecesAvailable !== null && quantity > offer.piecesAvailable) {
      throw new Error("cantidad de piezas insuficiente");
    }
    stockQuantity = quantity * offer.approximateQuantityPerPiece;
  }
  return {
    quantity,
    stockQuantity,
    quantity_kind: byPiece ? ("PIECE" as const) : ("SALE_UNIT" as const),
    weightChanged:
      byPiece &&
      Math.abs(stockQuantity - Number(item.unit_quantity)) > 0.000_001,
  };
}

async function inspectRepeatedItems(
  context: VerifiedContext,
  items: RepeatItem[]
) {
  const available: Array<{
    product_id: string;
    product_variant_id: string | null;
    quantity: number;
    quantity_kind: "PIECE" | "SALE_UNIT";
  }> = [];
  const differences: string[] = [];
  for (const item of items) {
    try {
      if (!item.product_id) {
        throw new Error("concepto manual");
      }
      const offer = await getOffer(context, item.product_id);
      const quantities = repeatedQuantities(item, offer);
      if (
        offer.stockAvailable !== null &&
        Number(offer.stockAvailable) < quantities.stockQuantity
      ) {
        throw new Error("disponibilidad insuficiente");
      }
      if (quantities.weightChanged) {
        differences.push(
          `${offer.productName}: el peso estimado actual para ${quantities.quantity} piezas es ${quantities.stockQuantity} ${offer.unitOfMeasure}`
        );
      }
      if (Number(item.unit_price) !== offer.unitPrice) {
        differences.push(
          `${offer.productName}: el precio actual es ${offer.unitPrice} ${offer.currency}`
        );
      }
      available.push({
        product_id: item.product_id,
        product_variant_id: item.product_variant_id,
        quantity: quantities.quantity,
        quantity_kind: quantities.quantity_kind,
      });
    } catch {
      differences.push(
        `${item.description || "Producto"}: requiere revisión; no se agregó ni se sustituyó`
      );
    }
  }
  return { available, differences };
}

async function repeatOrder(context: VerifiedContext, preSaleId: string) {
  const continuation = context.pendingAction;
  const continuingRepeat =
    continuation?.sourceMessageId === context.sourceMessageId &&
    continuation.preSaleId === preSaleId &&
    (continuation.kind === "REPEAT_READY" ||
      (continuation.kind === "SELECTED_PRE_SALE" &&
        continuation.purpose === "REPEAT"));
  if (!(isRepeatRequest(context.source.content) || continuingRepeat)) {
    throw new Error("Primero pedí que confirme qué compra quiere repetir");
  }
  await getPreSaleStatus(context, preSaleId);
  const current = await cartSummary(context);
  if (
    current.cart &&
    !(
      continuingRepeat &&
      continuation?.kind === "REPEAT_READY" &&
      continuation.cartId === current.cart.id &&
      current.items.length === 0
    )
  ) {
    throw new Error(
      "Primero resolvé si conserva o descarta el pedido pendiente"
    );
  }
  const { data: items, error } = await createWhatsAppAdminClient()
    .from("sales_order_items")
    .select(
      "product_id, product_variant_id, quantity, unit_quantity, unit_price, description"
    )
    .eq("organization_id", context.organizationId)
    .eq("sales_order_id", preSaleId)
    .order("id");
  if (error || !items?.length) {
    throw new Error("El pedido anterior no tiene productos repetibles");
  }
  const { available, differences } = await inspectRepeatedItems(context, items);
  if (!available.length) {
    return { differences, requiresClarification: true };
  }
  let cart = (await mutate(context, "START")) as Cart;
  for (const item of available) {
    const result = await upsertCartItem(context, {
      ...item,
      cart_id: cart.id,
      version: cart.version,
    });
    if (!result.cart) {
      throw new Error("El pedido dejó de estar disponible");
    }
    cart = result.cart;
  }
  if (differences.length) {
    await mutate(
      context,
      "REQUEST_REPEAT_REVIEW",
      { cart_id: cart.id, version: cart.version },
      { differences }
    );
  }
  // Never quote an incomplete copy automatically: the customer chooses missing items.
  return {
    ...(await cartSummary(context)),
    differences,
    requiresNewQuote: true,
  };
}

async function conversationHistory(context: VerifiedContext, offset: number) {
  const { data, error } = await createWhatsAppAdminClient()
    .from("whatsapp_messages")
    .select("id, direction, content, created_at")
    .eq("organization_id", context.organizationId)
    .eq("integration_id", context.integrationId)
    .eq("conversation_id", context.conversationId)
    .lte("created_at", context.source.created_at)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + 19);
  if (error) {
    throw new Error(error.message);
  }
  return {
    messages: [...(data ?? [])].reverse(),
    nextOffset: data?.length === 20 ? offset + 20 : null,
  };
}

type CartSummary = Awaited<ReturnType<typeof cartSummary>>;

function formatItemQuantity(item: CartSummary["items"][number]) {
  if (item.requestedPieces !== null) {
    return `${item.requestedPieces} piezas (aprox. ${item.quantity} ${item.unitOfMeasure})`;
  }
  return `${item.quantity}${item.unitOfMeasure ? ` ${item.unitOfMeasure}` : ""}`;
}

function renderQuoteResponse(state: CartSummary) {
  if (!state.cart) {
    throw new Error("No hay un pedido pendiente para cotizar");
  }
  const lines = state.items.map(
    (item) =>
      `${formatItemQuantity(item)} × ${item.productName}: ${roundMoney(item.quantity * item.unitPrice)} ${state.cart?.currency}`
  );
  const estimate = state.items.some((item) => item.quantityEstimated);
  return {
    text: `${lines.join("\n")}\nTotal${estimate ? " estimado" : ""} con impuestos: ${state.cart.quote_snapshot?.total} ${state.cart.currency}. ${estimate ? "El peso y el importe finales se reconfirman al preparar la mercadería. " : ""}¿Confirmás que registre la preventa? Esto no procesa el pago ni reserva stock.`,
    orderPrompt: true,
  };
}

async function convertedOrderResponse(context: VerifiedContext) {
  if (!context.currentPreSaleId) {
    return null;
  }
  const { data: converted, error: conversionError } =
    await createWhatsAppAdminClient()
      .from("conversation_carts")
      .select("id, quote_snapshot")
      .eq("organization_id", context.organizationId)
      .eq("conversation_id", context.conversationId)
      .eq("status", "CONVERTED")
      .eq("last_source_message_id", context.sourceMessageId)
      .maybeSingle();
  if (conversionError) {
    throw new Error("No se pudo verificar el cierre del pedido");
  }
  if (converted) {
    return {
      text:
        preSaleFollowUpMessage +
        (converted.quote_snapshot?.quantityEstimated
          ? " El peso y el importe finales se ajustan al preparar la mercadería."
          : ""),
      orderPrompt: false,
    };
  }
  return null;
}

async function assertLatestMessage(context: VerifiedContext) {
  const { data: latest, error } = await createWhatsAppAdminClient()
    .from("whatsapp_messages")
    .select("id")
    .eq("conversation_id", context.conversationId)
    .eq("organization_id", context.organizationId)
    .eq("integration_id", context.integrationId)
    .eq("direction", "INBOUND")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .single();
  if (error || latest?.id !== context.sourceMessageId) {
    throw new Error("El mensaje fue reemplazado por otro más reciente");
  }
}

async function renderOrderResponse(context: VerifiedContext, text: string) {
  await assertLatestMessage(context);
  if (context.conversationStatus === "HANDOFF") {
    return {
      text:
        context.handoffMessage ??
        "Una persona del equipo comercial va a continuar la atención por este chat.",
      orderPrompt: false,
    };
  }
  const convertedResponse = await convertedOrderResponse(context);
  if (convertedResponse) {
    return convertedResponse;
  }
  const state = await cartSummary(context);
  const action = context.pendingAction;
  if (
    action?.kind === "START_ORDER" &&
    action.sourceMessageId === context.sourceMessageId
  ) {
    return {
      text: "¿Querés que empecemos un pedido nuevo?",
      orderPrompt: true,
    };
  }
  if (
    action?.kind === "SELECT_PRE_SALE" &&
    action.sourceMessageId === context.sourceMessageId
  ) {
    const orders = action.orders as Array<{ number: string; date: string }>;
    return {
      text: `¿A cuál pedido te referís? ${orders.map((order, index) => `${index + 1}: ${order.number} del ${order.date}`).join("; ")}`,
      orderPrompt: true,
    };
  }
  if (
    action?.sourceMessageId !== context.sourceMessageId ||
    !state.cart ||
    action.cartId !== state.cart.id ||
    action.version !== state.cart.version
  ) {
    return { text, orderPrompt: false };
  }
  if (action.kind === "CONFIRM_PRE_SALE") {
    return renderQuoteResponse(state);
  }
  if (action.kind === "REVIEW_REPEAT") {
    return {
      text: `${(action.differences as string[]).join("\n")}\n¿Confirmás que sigamos con los productos disponibles y sus precios actuales? Después te paso el total para confirmar la preventa.`,
      orderPrompt: true,
    };
  }
  if (action.kind === "REPLACE_CART" || action.kind === "ABANDON_CART") {
    return {
      text:
        action.kind === "REPLACE_CART"
          ? "¿Confirmás que descarte el pedido pendiente y empecemos uno nuevo?"
          : "¿Confirmás que descarte el pedido pendiente?",
      orderPrompt: true,
    };
  }
  return { text, orderPrompt: false };
}

async function handoffToHuman(context: VerifiedContext, reason: string) {
  const { error } = await createWhatsAppAdminClient()
    .from("whatsapp_conversations")
    .update({
      status: "HANDOFF",
      handoff_reason: reason,
      pending_order_action: null,
      bot_paused_at: new Date().toISOString(),
      assigned_user_id: context.responsibleUserId,
    })
    .eq("id", context.conversationId)
    .eq("organization_id", context.organizationId)
    .eq("integration_id", context.integrationId)
    .eq("status", "ACTIVE");
  if (error) {
    throw new Error(`No se pudo derivar la conversación: ${error.message}`);
  }
  return {
    handedOff: true,
    message:
      context.handoffMessage ??
      "Te conectamos con una persona del equipo comercial para continuar.",
  };
}

const firstOrderPattern = /\b(primero|ultimo|último)\b/u;
const negativeAnswerPattern =
  /^\s*(?:no(?:[,\s]+no)*(?:[,\s]+gracias)?|no (?:quiero|me interesa)(?:[,\s]+gracias)?)[.!\s]*$/iu;
async function selectPreSale(verified: VerifiedContext, rawArgs: unknown) {
  const args = toolSchemas.select_pre_sale.parse(rawArgs);
  const orders = (verified.pendingAction?.orders ?? []) as Array<{
    id: string;
    number: string;
    date: string;
  }>;
  const index = orders.findIndex(
    (candidate) => candidate.id === args.pre_sale_id
  );
  const text = (verified.source.content ?? "").trim().toLowerCase();
  const order = orders[index];
  const explicit =
    order &&
    (text === String(index + 1) ||
      (order.number && text.includes(String(order.number))) ||
      (order.date && text.includes(order.date)) ||
      (index === 0 && firstOrderPattern.test(text)));
  if (!explicit) {
    throw new Error("Preguntá qué número o fecha de pedido quiere elegir");
  }
  await mutate(verified, "SELECT_ORDER", undefined, args);
  return getPreSaleStatus(verified, args.pre_sale_id);
}

export async function executeCommercialTool(
  context: CommercialToolContext,
  name: CommercialToolName,
  rawArgs: unknown
): Promise<unknown> {
  const verified = await verifyContext(
    context,
    name === "render_order_response"
  );

  switch (name) {
    case "get_commercial_state":
      toolSchemas.get_commercial_state.parse(rawArgs);
      return commercialState(verified);
    case "get_conversation_history":
      return conversationHistory(
        verified,
        toolSchemas.get_conversation_history.parse(rawArgs).offset
      );
    case "list_pre_sales":
      return listPreSales(
        verified,
        toolSchemas.list_pre_sales.parse(rawArgs).offset
      );
    case "request_new_order":
      toolSchemas.request_new_order.parse(rawArgs);
      await mutate(verified, "REQUEST_NEW");
      return { requiresConfirmation: true };
    case "start_order":
      toolSchemas.start_order.parse(rawArgs);
      if (
        !(
          isPurchaseRequest(verified.source.content) ||
          (verified.pendingAction?.kind === "START_ORDER" &&
            isExplicitConfirmation(verified.source.content))
        )
      ) {
        throw new Error(
          "Primero preguntá si quiere armar un pedido; una consulta o un sí aislado no inicia otra compra"
        );
      }
      await mutate(verified, "START", undefined, {
        confirmStart: !isPurchaseRequest(verified.source.content),
      });
      return cartSummary(verified);
    case "request_cart_abandonment": {
      const args = toolSchemas.request_cart_abandonment.parse(rawArgs);
      if (args.repeat_pre_sale_id) {
        await getPreSaleStatus(verified, args.repeat_pre_sale_id);
      }
      await mutate(verified, "REQUEST_ABANDON", args, {
        replace: args.replace,
        repeatPreSaleId: args.repeat_pre_sale_id ?? null,
      });
      return { requiresConfirmation: true };
    }
    case "abandon_cart": {
      const args = toolSchemas.abandon_cart.parse(rawArgs);
      await mutate(verified, "ABANDON", args);
      return cartSummary(verified);
    }
    case "remove_cart_item": {
      const args = toolSchemas.remove_cart_item.parse(rawArgs);
      await mutate(verified, "REMOVE", args, { item_id: args.item_id });
      return cartSummary(verified);
    }
    case "accept_repeat_changes": {
      await mutate(
        verified,
        "ACCEPT_REPEAT",
        toolSchemas.accept_repeat_changes.parse(rawArgs)
      );
      return cartSummary(verified);
    }
    case "request_pre_sale_selection": {
      const args = toolSchemas.request_pre_sale_selection.parse(rawArgs);
      const orders = await Promise.all(
        args.pre_sale_ids.map(
          async (id) => (await getPreSaleStatus(verified, id)).preSale
        )
      );
      await mutate(verified, "REQUEST_SELECTION", undefined, {
        purpose: args.purpose,
        orders: orders.map((order) => ({
          id: order?.id,
          number: order?.sale_number,
          date: order?.sale_date,
        })),
      });
      return { requiresSelection: true };
    }
    case "select_pre_sale": {
      return selectPreSale(verified, rawArgs);
    }
    case "cancel_pending_action": {
      toolSchemas.cancel_pending_action.parse(rawArgs);
      if (!negativeAnswerPattern.test(verified.source.content ?? "")) {
        throw new Error("El cliente no rechazó la acción pendiente");
      }
      await mutate(verified, "CANCEL_ACTION");
      return cartSummary(verified);
    }
    case "repeat_order":
      return repeatOrder(
        verified,
        toolSchemas.repeat_order.parse(rawArgs).pre_sale_id
      );
    case "render_order_response":
      return renderOrderResponse(
        verified,
        toolSchemas.render_order_response.parse(rawArgs).text
      );
    case "find_customer_by_phone":
      toolSchemas.find_customer_by_phone.parse(rawArgs);
      return findCustomer(verified);
    case "search_catalog":
      return searchCatalog(
        verified,
        toolSchemas.search_catalog.parse(rawArgs).query
      );
    case "get_offer":
      return getOffer(
        verified,
        toolSchemas.get_offer.parse(rawArgs).product_id
      );
    case "get_recommendations":
      return getRecommendations(
        verified,
        toolSchemas.get_recommendations.parse(rawArgs)
      );
    case "get_cart":
      toolSchemas.get_cart.parse(rawArgs);
      return cartSummary(verified);
    case "upsert_cart_item":
      return upsertCartItem(
        verified,
        toolSchemas.upsert_cart_item.parse(rawArgs)
      );
    case "quote_cart":
      return quoteCart(verified, toolSchemas.quote_cart.parse(rawArgs));
    case "create_pre_sale":
      return createPreSale(
        verified,
        toolSchemas.create_pre_sale.parse(rawArgs)
      );
    case "get_pre_sale_status":
      return getPreSaleStatus(
        verified,
        toolSchemas.get_pre_sale_status.parse(rawArgs).pre_sale_id
      );
    case "handoff_to_human":
      return handoffToHuman(
        verified,
        toolSchemas.handoff_to_human.parse(rawArgs).reason
      );
    default:
      throw new Error("Herramienta comercial no soportada");
  }
}
