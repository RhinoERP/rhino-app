import { truncateMoney } from "@/lib/decimal";
import { requireAuth } from "@/lib/supabase/auth";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { CreateQuoteInput } from "../types";

function calculateTotalAmount(input: CreateQuoteInput): number {
  return truncateMoney(
    input.items.reduce((sum, item) => {
      const extrasTotal = (item.extras || []).reduce(
        (acc, e) => acc + e.price,
        0
      );
      const itemVariantsSum = truncateMoney(
        (item.variants || []).reduce((acc, variant) => {
          const variantSubtotal = truncateMoney(
            variant.quantity * item.unitPrice
          );
          return (
            acc +
            truncateMoney((variantSubtotal + extrasTotal) * variant.quantity)
          );
        }, 0)
      );
      return sum + itemVariantsSum;
    }, 0)
  );
}

async function insertQuoteItemExtras(
  supabase: Awaited<
    ReturnType<typeof import("@/lib/supabase/server").createClient>
  >,
  itemId: string,
  extras: CreateQuoteInput["items"][number]["extras"]
): Promise<void> {
  if (!extras || extras.length === 0) {
    return;
  }

  const extrasInserts = extras.map((extra) => ({
    quote_item_id: itemId,
    description: extra.description,
    price: extra.price,
  }));

  const { error: extrasError } = await supabase
    .from("quote_item_extras")
    .insert(extrasInserts);

  if (extrasError) {
    throw new Error(`No se pudieron crear extras: ${extrasError.message}`);
  }
}

async function insertQuoteItemVariant(
  supabase: Awaited<
    ReturnType<typeof import("@/lib/supabase/server").createClient>
  >,
  quoteId: string,
  item: CreateQuoteInput["items"][number],
  variant: CreateQuoteInput["items"][number]["variants"][number]
): Promise<string> {
  const subtotal = truncateMoney(variant.quantity * item.unitPrice);
  const description =
    item.productName && variant.size
      ? `${item.productName} - Talle ${variant.size}`
      : (item.description ?? null);

  const { data: itemData, error: itemError } = await supabase
    .from("quote_items")
    .insert({
      quote_id: quoteId,
      product_id: item.productId ?? null,
      description,
      quantity: variant.quantity,
      unit_price: item.unitPrice,
      subtotal,
      discount_percentage: item.discountPercentage ?? null,
      discount_amount: item.discountAmount ?? null,
    })
    .select("id")
    .maybeSingle();

  if (itemError || !itemData?.id) {
    throw new Error(
      `No se pudo crear item del presupuesto: ${itemError?.message ?? "Error desconocido"}`
    );
  }

  return itemData.id;
}

async function insertQuoteItemsAndExtras(
  supabase: Awaited<
    ReturnType<typeof import("@/lib/supabase/server").createClient>
  >,
  quoteId: string,
  items: CreateQuoteInput["items"]
): Promise<void> {
  for (const item of items) {
    for (const variant of item.variants || []) {
      const itemId = await insertQuoteItemVariant(
        supabase,
        quoteId,
        item,
        variant
      );
      await insertQuoteItemExtras(supabase, itemId, item.extras);
    }
  }
}

export async function createQuote(input: CreateQuoteInput): Promise<string> {
  // Authenticate user and get Supabase client
  const auth = await requireAuth();
  if (!auth) {
    throw new Error("No autorizado");
  }

  const { supabase, userId } = auth;

  // Resolve organization
  const organization = await getOrganizationBySlug(input.orgSlug);
  if (!organization?.id) {
    throw new Error("Organización no encontrada");
  }

  // Calculate total amount
  const totalAmount = calculateTotalAmount(input);

  // 1. Insert quote header
  const { data: quoteData, error: quoteError } = await supabase
    .from("quotes")
    .insert({
      organization_id: organization.id,
      customer_id: input.customerId,
      status: "DRAFT",
      total_amount: totalAmount,
      currency: input.currency ?? "ARS",
      payment_condition: input.paymentCondition ?? null,
      observations: input.observations ?? null,
      created_by: userId,
    })
    .select("id")
    .maybeSingle();

  if (quoteError || !quoteData?.id) {
    throw new Error(
      `No se pudo crear el presupuesto: ${quoteError?.message ?? "Error desconocido"}`
    );
  }

  // 2 & 3. Insert quote items and extras
  await insertQuoteItemsAndExtras(supabase, quoteData.id, input.items);

  return quoteData.id;
}
