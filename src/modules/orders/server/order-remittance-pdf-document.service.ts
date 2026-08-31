import "server-only";

import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { renderHtmlToPdfBuffer } from "@/modules/arca/server/html-to-pdf.service";
import { getOrganizationSettings } from "@/modules/organizations/actions/get-organization-settings.action";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getRemittanceFinalVisibility } from "@/modules/organizations/types/organization-settings";
import {
  generateRemittanceHTML,
  type RemittanceData,
} from "@/modules/sales/service/remittance-generator.service";
import { resolveOrderAuthorizedInvoiceNumber } from "./order-remittance-invoice.service";

type OrderRemittancePdfDocument = {
  filename: string;
  content: Buffer;
  html: string;
};

export type OrderRemittanceData = {
  remittance: RemittanceData;
  orderNumber: string | number;
  carrierName: string | null;
};

type QuoteItemWithProduct = {
  id: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  discount_percentage: number | null;
  product_variant_id: string | null;
  product_variants: {
    talle: string | null;
    color: string | null;
  } | null;
  quote_item_extras: Array<{
    description: string;
    price: number;
  }> | null;
  products: {
    name: string | null;
    sku: string | null;
    brand: string | null;
    unit_of_measure: string | null;
  } | null;
};

type SaleItemPrices = {
  quote_item_id: string | null;
  description: string | null;
  quantity: number;
  unit_quantity: number | null;
  unit_price: number;
  discount_percentage: number | null;
};

async function fetchOrderItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  childOrderIds: string[],
  quoteId?: string
): Promise<RemittanceData["items"]> {
  const query = supabase
    .from("quote_items")
    .select(
      `
      id,
      description,
      quantity,
      unit_price,
      subtotal,
      discount_percentage,
      product_id,
      product_variant_id,
      product_variants!left(talle, color),
      products!left(name, sku, brand, unit_of_measure),
      quote_item_extras(*)
    `
    )
    .in("assigned_order_id", childOrderIds);

  let { data: quoteItems } = await query;

  // Pedidos directos (sin hijos) nunca asignan sus items, así que caen a los
  // items sin asignar del presupuesto del pedido.
  if ((quoteItems ?? []).length === 0 && quoteId) {
    ({ data: quoteItems } = await supabase
      .from("quote_items")
      .select(
        `
        id,
        description,
        quantity,
        unit_price,
        subtotal,
        discount_percentage,
        product_id,
        product_variant_id,
        product_variants!left(talle, color),
        products!left(name, sku, brand, unit_of_measure),
        quote_item_extras(*)
      `
      )
      .eq("quote_id", quoteId)
      .is("assigned_order_id", null));
  }

  const quoteIds = (quoteItems ?? []).map((item) => item.id);

  const saleByQuoteId = new Map<string, SaleItemPrices>();
  if (quoteIds.length > 0) {
    const { data: saleItems } = await supabase
      .from("sales_order_items")
      .select(
        "quote_item_id, description, quantity, unit_quantity, unit_price, discount_percentage"
      )
      .in("quote_item_id", quoteIds);

    for (const saleItem of saleItems ?? []) {
      if (
        saleItem.quote_item_id &&
        !saleByQuoteId.has(saleItem.quote_item_id)
      ) {
        saleByQuoteId.set(saleItem.quote_item_id, saleItem);
      }
    }
  }

  return (quoteItems ?? []).map((item: QuoteItemWithProduct) => {
    const saleItem = saleByQuoteId.get(item.id);
    const unitPrice = saleItem?.unit_price ?? item.unit_price;
    const quantity = saleItem?.quantity ?? item.quantity;
    const description = saleItem?.description ?? item.description;
    const extras = (item.quote_item_extras ?? []).map((extra) => ({
      description: extra.description,
      unitPrice: Number(extra.price ?? 0),
    }));
    const extrasTotal = truncateMoney(
      extras.reduce((sum, extra) => sum + extra.unitPrice, 0)
    );

    return {
      sku: item.products?.sku ?? "",
      name: item.products?.name ?? description ?? "Producto",
      brand: item.products?.brand ?? undefined,
      variantName: item.product_variants
        ? [item.product_variants.talle, item.product_variants.color]
            .filter(Boolean)
            .join(" · ") || undefined
        : undefined,
      quantity,
      unitOfMeasure: item.products?.unit_of_measure ?? "UN",
      weightQuantity: saleItem?.unit_quantity ?? undefined,
      unitPrice,
      subtotal: truncateMoney(unitPrice * quantity + extrasTotal * quantity),
      discountPercentage:
        saleItem?.discount_percentage ?? item.discount_percentage ?? undefined,
      extras,
    };
  });
}

type CustomerRow = {
  business_name: string;
  fantasy_name: string | null;
  cuit: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  tax_condition: string | null;
};

async function fetchCustomer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  customerId: string
): Promise<CustomerRow> {
  const { data: customer } = await supabase
    .from("customers")
    .select(
      "business_name, fantasy_name, cuit, phone, email, address, city, tax_condition"
    )
    .eq("id", customerId)
    .single();

  if (!customer) {
    throw new Error("Cliente no encontrado");
  }

  return customer;
}

function computeOrderTotals(items: RemittanceData["items"]) {
  const subtotal = truncateMoney(
    items.reduce((sum, item) => sum + item.subtotal, 0)
  );
  const discountTotal = truncateMoney(
    items.reduce(
      (sum, item) =>
        sum +
        (item.discountPercentage
          ? (item.subtotal * item.discountPercentage) / 100
          : 0),
      0
    )
  );
  return {
    subtotal,
    discountTotal,
    total: truncateMoney(Math.max(0, subtotal - discountTotal)),
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: assembles remittance data from order, customer, invoice, carrier, and organization sources
export async function getOrderRemittanceData(params: {
  orgSlug: string;
  childOrderIds: string[];
  remitoNumber: string;
}): Promise<OrderRemittanceData> {
  const supabase = await createClient();

  const { data: ordersData } = await supabase
    .from("orders")
    .select(
      "id, order_number, observations, quote_id, sales_order_id, parent_order_id, quotes!inner(customer_id, created_by)"
    )
    .in("id", params.childOrderIds);

  const orderData = (ordersData ?? [])[0];
  if (!orderData) {
    throw new Error("Pedido no encontrado");
  }

  const [[organization, orgSettingsResult], items] = await Promise.all([
    Promise.all([
      getOrganizationBySlug(params.orgSlug),
      getOrganizationSettings(params.orgSlug),
    ]),
    fetchOrderItems(
      supabase,
      params.childOrderIds,
      params.childOrderIds.length === 1 ? orderData.quote_id : undefined
    ),
  ]);

  const [customer, invoiceNumber, carrierResult] = await Promise.all([
    fetchCustomer(supabase, orderData.quotes.customer_id),
    resolveOrderAuthorizedInvoiceNumber(supabase, orderData),
    orderData.sales_order_id
      ? supabase
          .from("sales_orders")
          .select("carrier:carriers(name)")
          .eq("id", orderData.sales_order_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const singlePageDuplicate =
    orgSettingsResult.success && orgSettingsResult.data
      ? orgSettingsResult.data.remittance_single_page_duplicate
      : false;
  const finalRemittanceVisibility =
    orgSettingsResult.success && orgSettingsResult.data
      ? getRemittanceFinalVisibility(orgSettingsResult.data)
      : undefined;

  const { subtotal, discountTotal, total } = computeOrderTotals(items);

  const address =
    [customer.address, customer.city].filter(Boolean).join(", ") || undefined;

  const remittance: RemittanceData = {
    type: "REMITO_FINAL",
    documentNumber: params.remitoNumber,
    invoiceNumber,
    date: new Date().toISOString().split("T")[0],
    issuer: {
      businessName: organization?.name ?? "Empresa",
      cuit: organization?.cuit ?? undefined,
      legalAddress: undefined,
      logoUrl: organization?.logo_url ?? undefined,
    },
    customer: {
      businessName: customer.business_name,
      fantasyName: customer.fantasy_name ?? undefined,
      cuit: customer.cuit ?? undefined,
      phone: customer.phone ?? undefined,
      address,
      taxCondition: customer.tax_condition ?? undefined,
    },
    seller: { name: "Sin asignar" },
    items,
    subtotal,
    taxesTotal: 0,
    discountTotal,
    total,
    observations: orderData.observations ?? null,
    singlePageDuplicate,
    finalRemittanceVisibility,
  };

  const carrier = carrierResult.data?.carrier;
  const carrierRow = Array.isArray(carrier) ? carrier[0] : carrier;

  return {
    remittance,
    orderNumber: orderData.order_number ?? "sin-numero",
    carrierName: carrierRow?.name ?? null,
  };
}

export async function generateOrderRemittancePdfDocument(params: {
  orgSlug: string;
  childOrderIds: string[];
  remitoNumber: string;
}): Promise<OrderRemittancePdfDocument> {
  const { remittance, orderNumber } = await getOrderRemittanceData(params);
  const html = generateRemittanceHTML(remittance);
  const content = await renderHtmlToPdfBuffer(html);
  const filename =
    params.childOrderIds.length === 1
      ? `Remito_${orderNumber}.pdf`
      : `Remito_${params.remitoNumber}.pdf`;

  return { filename, content, html };
}

export async function resolveRemittanceOrderIds(
  childOrderId: string,
  remitoNumber: string
): Promise<string[]> {
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("order_dispatch_events")
    .select("dispatch_group_id")
    .eq("order_id", childOrderId)
    .eq("remito_number", remitoNumber)
    .maybeSingle();

  if (!event?.dispatch_group_id) {
    return [childOrderId];
  }

  const { data: groupEvents } = await supabase
    .from("order_dispatch_events")
    .select("order_id")
    .eq("dispatch_group_id", event.dispatch_group_id);

  const ids = [...new Set((groupEvents ?? []).map((e) => e.order_id))];
  return ids.length > 0 ? ids : [childOrderId];
}
