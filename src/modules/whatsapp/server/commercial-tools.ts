import { z } from "zod";
import { createWhatsAppPreSaleOrder } from "@/modules/sales/service/sales.service";
import { isExplicitConfirmation } from "./confirmation";
import { createWhatsAppAdminClient } from "./supabase-admin";

export const commercialToolNames = [
  "find_customer_by_phone",
  "search_catalog",
  "get_offer",
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
};

type VerifiedContext = CommercialToolContext & {
  customerPhone: string;
  customerId: string | null;
  currentPreSaleId: string | null;
  salesPriceListId: string;
  responsibleUserId: string;
  handoffMessage: string | null;
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
const unsafeSearchCharacter = /[%_,.]/g;
const whitespace = /\s+/g;

const toolSchemas = {
  find_customer_by_phone: z.object({}).strict(),
  search_catalog: z
    .object({ query: z.string().trim().min(2).max(120) })
    .strict(),
  get_offer: z.object({ product_id: identifier }).strict(),
  get_cart: z.object({}).strict(),
  upsert_cart_item: z
    .object({
      product_id: identifier,
      product_variant_id: identifier.nullable().optional(),
      quantity: z.number().positive().max(10_000),
    })
    .strict(),
  quote_cart: z.object({}).strict(),
  create_pre_sale: z.object({}).strict(),
  get_pre_sale_status: z.object({}).strict(),
  handoff_to_human: z
    .object({ reason: z.string().trim().min(2).max(500) })
    .strict(),
} satisfies Record<CommercialToolName, z.ZodType>;

function normalizedPhone(value: string | null): string {
  return (value ?? "").replace(nonDigit, "");
}

function normalizedSearch(value: string): string {
  return value
    .replace(unsafeSearchCharacter, " ")
    .replace(whitespace, " ")
    .trim();
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function verifyContext(
  context: CommercialToolContext
): Promise<VerifiedContext> {
  const supabase = createWhatsAppAdminClient();
  const [
    { data: integration, error: integrationError },
    { data: conversation, error: conversationError },
  ] = await Promise.all([
    supabase
      .from("whatsapp_integrations")
      .select(
        "id, organization_id, status, sales_price_list_id, responsible_user_id, handoff_message"
      )
      .eq("id", context.integrationId)
      .eq("organization_id", context.organizationId)
      .eq("status", "ACTIVE")
      .maybeSingle(),
    supabase
      .from("whatsapp_conversations")
      .select(
        "id, organization_id, integration_id, status, customer_phone, customer_id, current_pre_sale_id"
      )
      .eq("id", context.conversationId)
      .eq("organization_id", context.organizationId)
      .eq("integration_id", context.integrationId)
      .eq("status", "ACTIVE")
      .maybeSingle(),
  ]);

  if (integrationError || conversationError || !(integration && conversation)) {
    throw new Error("La conversación no está disponible para automatización");
  }
  if (!(integration.sales_price_list_id && integration.responsible_user_id)) {
    throw new Error("La integración comercial está incompleta");
  }

  return {
    ...context,
    customerPhone: conversation.customer_phone,
    customerId: conversation.customer_id,
    currentPreSaleId: conversation.current_pre_sale_id,
    salesPriceListId: integration.sales_price_list_id,
    responsibleUserId: integration.responsible_user_id,
    handoffMessage: integration.handoff_message,
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

async function getOrCreateCart(context: VerifiedContext) {
  const supabase = createWhatsAppAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("conversation_carts")
    .select("id, status, currency, quoted_at, confirmed_at")
    .eq("conversation_id", context.conversationId)
    .eq("organization_id", context.organizationId)
    .maybeSingle();
  if (existingError) {
    throw new Error(`No se pudo obtener el carrito: ${existingError.message}`);
  }
  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from("conversation_carts")
    .insert({
      organization_id: context.organizationId,
      conversation_id: context.conversationId,
    })
    .select("id, status, currency, quoted_at, confirmed_at")
    .single();
  if (error || !data) {
    throw new Error(
      `No se pudo crear el carrito: ${error?.message ?? "sin datos"}`
    );
  }
  return data;
}

async function cartSummary(context: VerifiedContext) {
  const supabase = createWhatsAppAdminClient();
  const cart = await getOrCreateCart(context);
  const { data: items, error } = await supabase
    .from("conversation_cart_items")
    .select(
      "id, product_id, product_variant_id, quantity, unit_price, price_snapshot"
    )
    .eq("cart_id", cart.id)
    .eq("organization_id", context.organizationId)
    .order("created_at");
  if (error) {
    throw new Error(
      `No se pudo obtener los ítems del carrito: ${error.message}`
    );
  }

  const cartItems = (items ?? []) as CartItem[];
  return {
    cart,
    items: cartItems.map((item) => ({
      id: item.id,
      productId: item.product_id,
      productVariantId: item.product_variant_id,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      subtotal: roundMoney(Number(item.quantity) * Number(item.unit_price)),
      productName: item.price_snapshot?.productName ?? "Producto",
      sku: item.price_snapshot?.sku ?? null,
    })),
  };
}

async function findCustomer(context: VerifiedContext) {
  const supabase = createWhatsAppAdminClient();
  if (context.customerId) {
    const { data: linkedCustomer } = await supabase
      .from("customers")
      .select("id, business_name, fantasy_name, phone, email")
      .eq("id", context.customerId)
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
  const search = normalizedSearch(query);
  if (search.length < 2) {
    throw new Error("La búsqueda debe incluir al menos dos caracteres");
  }
  const supabase = createWhatsAppAdminClient();
  const { data: products, error } = await supabase
    .from("products_with_price")
    .select("id, name, sku, description, currency")
    .eq("organization_id", context.organizationId)
    .eq("is_active", true)
    .or(`name.ilike.%${search}%,sku.ilike.%${search}%`)
    .order("name")
    .limit(8);
  if (error) {
    throw new Error(`No se pudo buscar el catálogo: ${error.message}`);
  }

  return {
    products: (
      (products ?? []) as Array<{
        id: string | null;
        name: string | null;
        sku: string | null;
        description: string | null;
        currency: string | null;
      }>
    ).map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      description: product.description,
      currency: product.currency ?? "ARS",
    })),
  };
}

async function getOffer(context: VerifiedContext, productId: string) {
  const [offer, stockResult] = await Promise.all([
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
  ]);
  if (stockResult.error) {
    throw new Error(
      `No se pudo consultar el stock: ${stockResult.error.message}`
    );
  }
  return {
    ...offer,
    stockAvailable: stockResult.data?.total_stock ?? null,
    unitOfMeasure: stockResult.data?.unit_of_measure ?? null,
  };
}

async function upsertCartItem(
  context: VerifiedContext,
  args: z.infer<(typeof toolSchemas)["upsert_cart_item"]>
) {
  const offer = await getOffer(context, args.product_id);
  const cart = await getOrCreateCart(context);
  if (cart.status === "CONVERTED") {
    throw new Error("El carrito ya fue convertido en preventa");
  }
  const supabase = createWhatsAppAdminClient();
  let query = supabase
    .from("conversation_cart_items")
    .select("id")
    .eq("cart_id", cart.id)
    .eq("organization_id", context.organizationId)
    .eq("product_id", args.product_id);
  query = args.product_variant_id
    ? query.eq("product_variant_id", args.product_variant_id)
    : query.is("product_variant_id", null);
  const { data: existing, error: existingError } = await query.maybeSingle();
  if (existingError) {
    throw new Error(
      `No se pudo actualizar el carrito: ${existingError.message}`
    );
  }

  const values = {
    quantity: args.quantity,
    unit_price: offer.unitPrice,
    price_snapshot: {
      productName: offer.productName,
      sku: offer.sku,
      priceListId: offer.priceList.id,
      priceListName: offer.priceList.name,
      quotedAt: new Date().toISOString(),
    },
  };
  const write = existing
    ? supabase
        .from("conversation_cart_items")
        .update(values)
        .eq("id", existing.id)
        .eq("organization_id", context.organizationId)
    : supabase.from("conversation_cart_items").insert({
        ...values,
        organization_id: context.organizationId,
        cart_id: cart.id,
        product_id: args.product_id,
        product_variant_id: args.product_variant_id ?? null,
      });
  const { error } = await write;
  if (error) {
    throw new Error(`No se pudo guardar el ítem: ${error.message}`);
  }
  await supabase
    .from("conversation_carts")
    .update({ status: "OPEN", quoted_at: null })
    .eq("id", cart.id)
    .eq("organization_id", context.organizationId);
  return cartSummary(context);
}

async function quoteCart(context: VerifiedContext) {
  const initial = await cartSummary(context);
  if (!initial.items.length) {
    throw new Error("El carrito está vacío");
  }
  const supabase = createWhatsAppAdminClient();
  for (const item of initial.items) {
    const offer = await getOffer(context, item.productId);
    const { error } = await supabase
      .from("conversation_cart_items")
      .update({
        unit_price: offer.unitPrice,
        price_snapshot: {
          productName: offer.productName,
          sku: offer.sku,
          priceListId: offer.priceList.id,
          priceListName: offer.priceList.name,
          quotedAt: new Date().toISOString(),
        },
      })
      .eq("id", item.id)
      .eq("cart_id", initial.cart.id)
      .eq("organization_id", context.organizationId);
    if (error) {
      throw new Error(`No se pudo recalcular el carrito: ${error.message}`);
    }
  }
  const { error: cartError } = await supabase
    .from("conversation_carts")
    .update({ status: "QUOTED", quoted_at: new Date().toISOString() })
    .eq("id", initial.cart.id)
    .eq("organization_id", context.organizationId);
  if (cartError) {
    throw new Error(`No se pudo cotizar el carrito: ${cartError.message}`);
  }
  const quoted = await cartSummary(context);
  const total = quoted.items.reduce((sum, item) => sum + item.subtotal, 0);
  return {
    ...quoted,
    total: roundMoney(total),
    currency: quoted.cart.currency,
  };
}

async function createPreSale(context: VerifiedContext) {
  if (context.currentPreSaleId) {
    return { preSaleId: context.currentPreSaleId, alreadyCreated: true };
  }
  const supabase = createWhatsAppAdminClient();
  const { data: linkedPreSale, error: linkedPreSaleError } = await supabase
    .from("sales_orders")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("conversation_id" as never, context.conversationId)
    .maybeSingle();
  if (linkedPreSaleError) {
    throw new Error(
      `No se pudo verificar la preventa existente: ${linkedPreSaleError.message}`
    );
  }
  if (linkedPreSale) {
    await supabase
      .from("whatsapp_conversations")
      .update({ current_pre_sale_id: linkedPreSale.id })
      .eq("id", context.conversationId)
      .eq("organization_id", context.organizationId)
      .eq("integration_id", context.integrationId);
    return { preSaleId: linkedPreSale.id, alreadyCreated: true };
  }
  const [{ data: cart }, { data: latestInbound }] = await Promise.all([
    supabase
      .from("conversation_carts")
      .select("id, status")
      .eq("conversation_id", context.conversationId)
      .eq("organization_id", context.organizationId)
      .maybeSingle(),
    supabase
      .from("whatsapp_messages")
      .select("content")
      .eq("conversation_id", context.conversationId)
      .eq("organization_id", context.organizationId)
      .eq("integration_id", context.integrationId)
      .eq("direction", "INBOUND")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (cart?.status !== "QUOTED") {
    throw new Error("Primero hay que cotizar el carrito actualizado");
  }
  if (!isExplicitConfirmation(latestInbound?.content ?? null)) {
    throw new Error("Todavía falta una confirmación explícita del cliente");
  }

  const customer = await findCustomer(context);
  if (!(customer.found && customer.customer)) {
    throw new Error(
      "No se encontró un cliente asociado al teléfono para crear la preventa"
    );
  }
  const quoted = await quoteCart(context);
  const saleDate = new Date().toISOString().slice(0, 10);
  const preSaleId = await createWhatsAppPreSaleOrder({
    organizationId: context.organizationId,
    conversationId: context.conversationId,
    sellerId: context.responsibleUserId,
    input: {
      orgSlug: "whatsapp-integration",
      customerId: customer.customer.id,
      saleDate,
      salesPriceListId: context.salesPriceListId,
      observations: `Preventa originada por WhatsApp · conversación ${context.conversationId}`,
      items: quoted.items.map((item) => ({
        productId: item.productId,
        productVariantId: item.productVariantId,
        description: String(item.productName),
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    },
  });
  const { error } = await supabase
    .from("whatsapp_conversations")
    .update({ current_pre_sale_id: preSaleId })
    .eq("id", context.conversationId)
    .eq("organization_id", context.organizationId)
    .eq("integration_id", context.integrationId);
  if (error) {
    throw new Error(
      `No se pudo vincular la preventa a la conversación: ${error.message}`
    );
  }
  await supabase
    .from("conversation_carts")
    .update({ status: "CONVERTED", confirmed_at: new Date().toISOString() })
    .eq("id", cart.id)
    .eq("organization_id", context.organizationId);
  return { preSaleId, alreadyCreated: false };
}

async function getPreSaleStatus(context: VerifiedContext) {
  if (!context.currentPreSaleId) {
    return { preSale: null };
  }
  const { data, error } = await createWhatsAppAdminClient()
    .from("sales_orders")
    .select("id, sale_number, status, preventa_status, total_amount, currency")
    .eq("id", context.currentPreSaleId)
    .eq("organization_id", context.organizationId)
    .maybeSingle();
  if (error) {
    throw new Error(`No se pudo consultar la preventa: ${error.message}`);
  }
  return { preSale: data ?? null };
}

async function handoffToHuman(context: VerifiedContext, reason: string) {
  const { error } = await createWhatsAppAdminClient()
    .from("whatsapp_conversations")
    .update({
      status: "HANDOFF",
      handoff_reason: reason,
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

export async function executeCommercialTool(
  context: CommercialToolContext,
  name: CommercialToolName,
  rawArgs: unknown
): Promise<unknown> {
  const verified = await verifyContext(context);

  switch (name) {
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
    case "get_cart":
      toolSchemas.get_cart.parse(rawArgs);
      return cartSummary(verified);
    case "upsert_cart_item":
      return upsertCartItem(
        verified,
        toolSchemas.upsert_cart_item.parse(rawArgs)
      );
    case "quote_cart":
      toolSchemas.quote_cart.parse(rawArgs);
      return quoteCart(verified);
    case "create_pre_sale":
      toolSchemas.create_pre_sale.parse(rawArgs);
      return createPreSale(verified);
    case "get_pre_sale_status":
      toolSchemas.get_pre_sale_status.parse(rawArgs);
      return getPreSaleStatus(verified);
    case "handoff_to_human":
      return handoffToHuman(
        verified,
        toolSchemas.handoff_to_human.parse(rawArgs).reason
      );
    default:
      throw new Error("Herramienta comercial no soportada");
  }
}
