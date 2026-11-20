import { z } from "zod";
import { truncateMoney } from "@/lib/decimal";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { createClient } from "@/lib/supabase/server";
import { getVisibleCustomersByOrgSlug } from "@/modules/customers/service/customers.service";
import { sellerOfflineSnapshotV1Schema } from "@/modules/offline/contracts/seller-offline-snapshot";
import { decryptOfflineCostSnapshot } from "@/modules/offline/server/seller-offline-cost-snapshot";
import { verifySellerOfflineSnapshotSignature } from "@/modules/offline/server/seller-offline-snapshot-signature";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { convertPriceToQuoteCurrency } from "@/modules/quotes/utils/currency-conversion";
import {
  getSaleProducts,
  getSalesAccessContext,
} from "@/modules/sales/service/sales.service";
import { buildItemizedTaxPlan } from "@/modules/taxes/item-tax-calculations";
import { calculateCompetitivePriceSuggestion } from "../competitive-pricing";
import { createSalesQuoteRequestSchema } from "./sales-quote-requests.service";

export const offlineSalesQuoteRequestCommandSchema = z.object({
  commandId: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  organizationId: z.string().uuid(),
  orgSlug: z.string().min(1).max(100),
  signature: z.string().min(1).max(4096),
  snapshot: sellerOfflineSnapshotV1Schema,
  quote: createSalesQuoteRequestSchema,
  createdAt: z.string().datetime(),
  preparedOn: z.iso.date().optional(),
});

export class OfflineQuoteRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "OfflineQuoteRequestError";
    this.status = status;
  }
}

function adjustedPrice(
  price: number,
  adjustment?: { type: string; value: number }
) {
  if (!adjustment) {
    return price;
  }
  return truncateMoney(
    adjustment.type === "PRICE"
      ? Math.max(0, price + adjustment.value)
      : price * (1 + adjustment.value / 100)
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validates signed snapshot, current authorization, historical pricing and atomic persistence.
export async function createOfflineSalesQuoteRequest(rawCommand: unknown) {
  const command = offlineSalesQuoteRequestCommandSchema.parse(rawCommand);
  const preparedTimestamp = Date.parse(command.createdAt);
  const preparedOn = command.preparedOn ?? command.createdAt.slice(0, 10);
  const utcDay = command.createdAt.slice(0, 10);
  if (
    preparedTimestamp > Date.now() + 5 * 60_000 ||
    Math.abs(
      Date.parse(`${preparedOn}T00:00:00Z`) - Date.parse(`${utcDay}T00:00:00Z`)
    ) > 86_400_000
  ) {
    throw new OfflineQuoteRequestError("Fecha de preparación inválida", 400);
  }
  const snapshot = command.snapshot;
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    throw new OfflineQuoteRequestError("La sesión no es válida", 401);
  }
  if (
    authData.user.id !== command.ownerUserId ||
    snapshot.ownerUserId !== command.ownerUserId ||
    snapshot.organizationId !== command.organizationId ||
    snapshot.organization.slug !== command.orgSlug ||
    command.quote.orgSlug !== command.orgSlug ||
    !verifySellerOfflineSnapshotSignature(snapshot, command.signature)
  ) {
    throw new OfflineQuoteRequestError(
      "El snapshot firmado no corresponde al usuario u organización",
      403
    );
  }

  const access = await getSalesAccessContext(command.orgSlug);
  if (!access.canManage || access.userId !== command.ownerUserId) {
    throw new OfflineQuoteRequestError(
      "No tienes permisos actuales para enviar cotizaciones",
      403
    );
  }

  const organization = await getOrganizationBySlug(command.orgSlug);
  if (!organization?.id || organization.is_active === false) {
    throw new OfflineQuoteRequestError(
      "La organización no está disponible",
      409
    );
  }

  // Current reads validate only that references remain authorized/active.
  // Commercial values below always come from the signed snapshot.
  const [customers, products] = await Promise.all([
    getVisibleCustomersByOrgSlug(command.orgSlug),
    getSaleProducts(command.orgSlug),
  ]);
  const customer = customers.find(
    (entry) => entry.id === command.quote.customerId && entry.is_active
  );
  if (
    !(customer && snapshot.customers.some((entry) => entry.id === customer.id))
  ) {
    throw new OfflineQuoteRequestError("El cliente ya no está disponible", 409);
  }
  const snapshotCustomer = snapshot.customers.find(
    (entry) => entry.id === customer.id
  );
  if (!snapshotCustomer) {
    throw new OfflineQuoteRequestError(
      "El cliente no estaba en el snapshot firmado",
      409
    );
  }
  const productIds = [
    ...new Set(command.quote.items.map((item) => item.productId)),
  ];
  const productsById = new Map(
    products.map((product) => [product.id, product])
  );
  const { data: variants, error: variantsError } = await supabase
    .from("product_variants")
    .select("id, product_id, talle, color")
    .eq("organization_id", organization.id)
    .eq("is_active", true)
    .in("product_id", productIds);
  if (variantsError) {
    throw new OfflineQuoteRequestError(
      "No se pudieron validar las variantes",
      503
    );
  }
  const activeVariants = new Map(
    (variants ?? []).map((variant) => [variant.id, variant])
  );

  const selectedLevel = command.quote.priceLevelId
    ? snapshot.priceLevels?.find(
        (level) =>
          level.id === command.quote.priceLevelId &&
          level.isActive &&
          level.status === "Active"
      )
    : null;
  if (command.quote.priceLevelId && !selectedLevel) {
    throw new OfflineQuoteRequestError(
      "El nivel de precios no estaba disponible en el snapshot firmado",
      409
    );
  }
  if (
    command.quote.salesPriceListId &&
    !snapshot.salesPriceLists.some(
      (list) => list.id === command.quote.salesPriceListId
    )
  ) {
    throw new OfflineQuoteRequestError(
      "La lista de precios no estaba en el snapshot firmado",
      409
    );
  }
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: each line must be checked against both authenticated current references and the signed commercial snapshot.
  const lines = command.quote.items.map((item, index) => {
    const product = snapshot.products.find(
      (entry) => entry.id === item.productId
    );
    const currentProduct = productsById.get(item.productId);
    if (
      !(product && currentProduct) ||
      (item.productVariantId &&
        activeVariants.get(item.productVariantId)?.product_id !==
          item.productId) ||
      (currentProduct.hasVariants && !item.productVariantId) ||
      (!currentProduct.hasVariants && item.productVariantId)
    ) {
      throw new OfflineQuoteRequestError(
        "Un producto o variante ya no está disponible",
        409
      );
    }
    const priceByLevel = selectedLevel
      ? product.priceByLevel?.find(
          (entry) => entry.priceLevelId === selectedLevel.id
        )?.price
      : product.price;
    if (priceByLevel == null) {
      throw new OfflineQuoteRequestError(
        "El snapshot no incluye el precio del nivel seleccionado",
        409
      );
    }
    const assignment = snapshot.customerPriceAssignments.find(
      (entry) =>
        entry.customerId === customer.id &&
        entry.supplierId === product.supplierId
    );
    const listId =
      command.quote.salesPriceListId ??
      assignment?.salesPriceListId ??
      snapshotCustomer.salesPriceListId ??
      null;
    const list = listId
      ? snapshot.salesPriceLists.find((entry) => entry.id === listId)
      : null;
    const baseProductPrice = adjustedPrice(priceByLevel, list ?? undefined);
    if (
      product.currency !== command.quote.currency &&
      !command.quote.exchangeRate
    ) {
      throw new OfflineQuoteRequestError(
        `Falta tipo de cambio para ${product.name}`,
        400
      );
    }
    const baseUnitPrice = convertPriceToQuoteCurrency(
      baseProductPrice,
      product.currency,
      command.quote.currency,
      command.quote.exchangeRate
    );
    const pricing = calculateCompetitivePriceSuggestion(
      baseUnitPrice,
      item.competitorUnitPrice,
      item.agreedUnitPrice
    );
    const variant = item.productVariantId
      ? activeVariants.get(item.productVariantId)
      : null;
    const lineSubtotal = truncateMoney(pricing.agreedUnitPrice * item.quantity);
    const costProductCurrency = decryptOfflineCostSnapshot(
      product.costSnapshotCiphertext,
      {
        organizationId: snapshot.organizationId,
        ownerUserId: snapshot.ownerUserId,
        productId: product.id,
        snapshotId: snapshot.snapshotId,
      }
    );
    const unitCost =
      costProductCurrency == null
        ? null
        : convertPriceToQuoteCurrency(
            costProductCurrency,
            product.currency,
            command.quote.currency,
            command.quote.exchangeRate
          );
    return { item, index, product, variant, pricing, lineSubtotal, unitCost };
  });

  const taxPlan = buildItemizedTaxPlan({
    globalDiscountAmount: 0,
    lines: lines.map((line) => ({
      lineId: `line-${line.index + 1}`,
      productId: line.product.id,
      netAmount: line.lineSubtotal,
      taxes: line.product.taxes.map((tax) => ({
        taxId: tax.taxId,
        name: tax.name,
        rate: tax.rate,
        taxCodeSnapshot: tax.code,
        source: "product" as const,
      })),
    })),
  });
  const lineSnapshots = lines.map((line) => ({
    line_number: line.index + 1,
    product_id: line.product.id,
    product_variant_id: line.item.productVariantId ?? null,
    product_name_snapshot: line.variant
      ? `${line.product.name} - ${line.variant.talle} / ${line.variant.color}`
      : line.product.name,
    sku_snapshot: line.product.sku,
    unit_of_measure_snapshot: line.product.unitOfMeasure,
    product_currency_snapshot: line.product.currency,
    quantity: line.item.quantity,
    pricing_method: line.item.pricingMethod,
    base_unit_price: line.pricing.baseUnitPrice,
    competitor_unit_price: line.pricing.competitorUnitPrice,
    agreed_unit_price: line.pricing.agreedUnitPrice,
    discount_percentage: line.pricing.discountPercentage,
    discount_amount: truncateMoney(
      line.pricing.discountAmount * line.item.quantity
    ),
    price_increase_amount: truncateMoney(
      line.pricing.priceIncreaseAmount * line.item.quantity
    ),
    adjustment_type: line.pricing.adjustmentType,
    unit_cost_snapshot: line.unitCost,
    line_subtotal: line.lineSubtotal,
    taxes_snapshot: taxPlan.itemTaxes
      .filter((tax) => tax.lineId === `line-${line.index + 1}`)
      .map((tax) => ({
        tax_id: tax.taxId,
        name: tax.name,
        rate: tax.rate,
        base_amount: truncateMoney(tax.baseAmount),
        tax_amount: truncateMoney(tax.taxAmount),
        tax_code_snapshot: tax.taxCodeSnapshot,
        source: tax.source,
      })),
    product_comment: line.item.comment ?? "",
  }));
  const subtotal = truncateMoney(
    lines.reduce((sum, line) => sum + line.lineSubtotal, 0)
  );
  const taxAmount = truncateMoney(taxPlan.totalTaxAmount);
  const userName =
    snapshot.sellers.find((seller) => seller.id === command.ownerUserId)
      ?.name ?? "Vendedor";
  const requestSnapshot = {
    prepared_on: preparedOn,
    organization_id: organization.id,
    customer_id: customer.id,
    created_by: command.ownerUserId,
    seller_user_id: command.ownerUserId,
    seller_name_snapshot: userName,
    seller_zone_snapshot: command.quote.sellerZone,
    customer_segment: command.quote.customerSegment,
    currency: command.quote.currency,
    exchange_rate: command.quote.exchangeRate ?? null,
    price_level_id: command.quote.priceLevelId ?? null,
    sales_price_list_id: command.quote.salesPriceListId ?? null,
    payment_method: command.quote.paymentMethod,
    payment_term: command.quote.paymentTerm,
    invoice_type: command.quote.invoiceType,
    subtotal_amount: subtotal,
    tax_amount: taxAmount,
    total_amount: truncateMoney(subtotal + taxAmount),
    seller_observations: command.quote.observations,
    offline_snapshot_id: snapshot.snapshotId,
    offline_snapshot_generated_at: snapshot.generatedAt,
    offline_snapshot_expires_at: snapshot.expiresAt,
    offline_snapshot_was_expired: Date.parse(snapshot.expiresAt) < Date.now(),
    offline_cost_snapshot_incomplete: lines.some(
      (line) => line.unitCost == null
    ),
  };
  const admin = createAdminClient() as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<{
      data: Array<{
        request_id: string;
        duplicate: boolean;
      }> | null;
      error: { message: string } | null;
    }>;
    from: (table: string) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string
        ) => {
          single: () => Promise<{
            data: {
              offline_snapshot_was_expired: boolean;
              offline_cost_snapshot_incomplete: boolean;
            } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  let { data, error } = await admin.rpc(
    "create_sales_quote_request_idempotent",
    {
      p_idempotency_key: command.commandId,
      p_request: requestSnapshot,
      p_items: lineSnapshots,
    }
  );
  // A previously queued command may have been accepted by the old RPC before
  // preparation dates existed. Retry its original payload for idempotent replay.
  if (
    error?.message.includes("OFFLINE_IDEMPOTENCY_CONFLICT") &&
    !command.preparedOn
  ) {
    ({ data, error } = await admin.rpc(
      "create_sales_quote_request_idempotent",
      {
        p_idempotency_key: command.commandId,
        p_request: Object.fromEntries(
          Object.entries(requestSnapshot).filter(
            ([key]) => key !== "prepared_on"
          )
        ),
        p_items: lineSnapshots,
      }
    ));
  }
  if (error) {
    if (error.message.includes("OFFLINE_IDEMPOTENCY_CONFLICT")) {
      throw new OfflineQuoteRequestError(
        "La clave de comando ya fue usada con otra cotización",
        409
      );
    }
    throw new OfflineQuoteRequestError(error.message, 503);
  }
  const result = data?.[0];
  if (!result?.request_id) {
    throw new OfflineQuoteRequestError("No se obtuvo el ID de solicitud", 503);
  }
  const { data: persistedMetadata, error: metadataError } = await admin
    .from("sales_quote_requests")
    .select("offline_snapshot_was_expired,offline_cost_snapshot_incomplete")
    .eq("id", result.request_id)
    .single();
  if (metadataError || !persistedMetadata) {
    throw new OfflineQuoteRequestError(
      "No se pudieron leer las advertencias de la solicitud",
      503
    );
  }

  return {
    ok: true as const,
    commandId: command.commandId,
    requestId: result.request_id,
    duplicate: result.duplicate,
    snapshotExpired: persistedMetadata.offline_snapshot_was_expired,
    historicalCostMissing: persistedMetadata.offline_cost_snapshot_incomplete,
  };
}
