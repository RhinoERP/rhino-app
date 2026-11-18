import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { createTypedAdminClient } from "@/lib/supabase/admin-client";
import { createClient } from "@/lib/supabase/server";
import { normalizeArcaTaxCode } from "@/modules/arca/tax-codes";
import { validateCuit } from "@/modules/arca/validation";
import { guardOrganizationModuleAccess } from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { getProductTaxAssignments } from "@/modules/taxes/product-tax.service";
import { MeliConfirmationError } from "../errors";
import {
  type CreateMeliSaleInput,
  createMeliSaleSchema,
  type MeliSaleResult,
  type ValidatedMeliSale,
} from "../types";
import { loadMeliLots, loadMeliPrices } from "./meli-catalog.repository";
import { assertMeliInvoiceChoice } from "./meli-fiscal-settings.service";
import { buildMeliSalePlan } from "./meli-sale-plan";

type Admin = ReturnType<typeof createTypedAdminClient>;
const ROLLED_BACK_SQL_CODES = new Set([
  "P0001",
  "23505",
  "23514",
  "23503",
  "22023",
  "22P02",
  "42501",
  "40P01",
  "55P03",
]);

async function loadCommercialData(
  admin: Admin,
  orgId: string,
  input: ValidatedMeliSale
) {
  const ids = [...new Set(input.items.map((item) => item.productId))];
  const variantIds = [
    ...new Set(
      input.items.flatMap((item) =>
        item.productVariantId ? [item.productVariantId] : []
      )
    ),
  ];
  const [products, basePrices, variants, lots, productTaxes, taxes] =
    await Promise.all([
      admin
        .from("products")
        .select(
          "id, name, is_active, has_variants, unit_of_measure, tracks_stock_units"
        )
        .eq("organization_id", orgId)
        .in("id", ids),
      loadMeliPrices(admin, orgId, ids),
      variantIds.length
        ? admin
            .from("product_variants")
            .select("id, product_id, is_active")
            .eq("organization_id", orgId)
            .in("id", variantIds)
        : Promise.resolve({ data: [], error: null }),
      loadMeliLots(admin, orgId, input.warehouseId, ids),
      getProductTaxAssignments({ supabase: admin, orgId, productIds: ids }),
      input.taxIds.length
        ? admin
            .from("taxes")
            .select("id, name, rate, code")
            .eq("organization_id", orgId)
            .eq("is_active", true)
            .in("id", input.taxIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (products.error || variants.error || taxes.error) {
    throw new Error(
      "No se pudieron validar productos, precios o impuestos de la venta."
    );
  }
  for (const item of input.items) {
    if (
      item.productVariantId &&
      !variants.data.some(
        (variant) =>
          variant.id === item.productVariantId &&
          variant.product_id === item.productId &&
          variant.is_active
      )
    ) {
      throw new Error(
        "La variante no existe, está inactiva o no corresponde al producto."
      );
    }
  }
  if (taxes.data.length !== input.taxIds.length) {
    throw new Error("Un impuesto seleccionado no está disponible.");
  }
  return {
    products: products.data,
    basePrices,
    lots,
    productTaxes,
    fallbackTaxes: input.taxIds.map((id) => {
      const tax = taxes.data.find((row) => row.id === id);
      if (!tax) {
        throw new Error("Impuesto no disponible.");
      }
      return {
        taxId: tax.id,
        name: tax.name,
        rate: tax.rate,
        taxCodeSnapshot: normalizeArcaTaxCode(tax.code),
      };
    }),
  };
}

async function validateSaleContext(
  admin: Admin,
  orgId: string,
  actorId: string,
  input: ValidatedMeliSale
) {
  const [settings, warehouse, member, customer] = await Promise.all([
    admin
      .from("mercadolibre_settings")
      .select("warehouse_id")
      .eq("organization_id", orgId)
      .maybeSingle(),
    admin
      .from("warehouses")
      .select("id, is_active, direct_sale_enabled")
      .eq("organization_id", orgId)
      .eq("id", input.warehouseId)
      .maybeSingle(),
    admin
      .from("organization_members")
      .select("is_active")
      .eq("organization_id", orgId)
      .eq("user_id", actorId)
      .maybeSingle(),
    input.customerId
      ? admin
          .from("customers")
          .select("id")
          .eq("organization_id", orgId)
          .eq("id", input.customerId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (settings.error || warehouse.error || member.error || customer.error) {
    throw new Error("No se pudo validar el contexto de la venta Meli.");
  }
  if (!member.data?.is_active) {
    throw new Error("Usuario fuera de la organización.");
  }
  if (
    settings.data?.warehouse_id !== input.warehouseId ||
    !warehouse.data?.is_active ||
    !warehouse.data.direct_sale_enabled
  ) {
    throw new Error("Revisá el depósito configurado para Mercado Libre.");
  }
  if (input.customerId && !customer.data) {
    throw new Error("El cliente no pertenece a esta organización.");
  }
}

async function commit(
  admin: Admin,
  orgId: string,
  actorId: string,
  request: { key: string; payload: unknown }
): Promise<MeliSaleResult> {
  const result = await admin.rpc("commit_mercadolibre_sale", {
    p_org_id: orgId,
    p_actor_id: actorId,
    p_idempotency_key: request.key,
    p_payload: z.json().parse(JSON.parse(JSON.stringify(request.payload))),
  });
  if (result.error) {
    if (
      result.error.code === "23505" &&
      result.error.message.includes("sales_orders_meli_order_unique")
    ) {
      throw new MeliConfirmationError(
        "La orden de Mercado Libre ya fue registrada. Consultá el listado antes de repetir la carga.",
        true
      );
    }
    throw new MeliConfirmationError(
      result.error.message,
      ROLLED_BACK_SQL_CODES.has(result.error.code)
    );
  }
  const row = result.data?.[0];
  if (!row) {
    throw new Error(
      "No se obtuvo la confirmación de la venta; reintentá con la misma clave."
    );
  }
  return { saleId: row.sale_id, idempotent: row.idempotent };
}

async function requireMeliWriteContext(rawInput: CreateMeliSaleInput) {
  const input = createMeliSaleSchema.parse(rawInput);
  await ensure("mercadolibre.manage", input.orgSlug);
  await guardOrganizationModuleAccess(input.orgSlug, "pos");
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) {
    throw new Error("Sesión inválida.");
  }
  const org = await getOrganizationBySlug(input.orgSlug);
  if (!org) {
    throw new Error("Organización no encontrada.");
  }
  if (input.receiver.document_type === "CUIT") {
    validateCuit(input.receiver.document_number, "CUIT del comprador");
  }
  const admin = createTypedAdminClient();
  return { input, supabase, actorId: auth.data.user.id, org, admin };
}

async function prepareNewMeliSale(
  context: Awaited<ReturnType<typeof requireMeliWriteContext>>
) {
  const { admin, org, actorId, input, supabase } = context;
  await assertMeliInvoiceChoice(
    admin,
    org.id,
    input.invoiceType,
    input.receiver.tax_condition
  );
  await validateSaleContext(admin, org.id, actorId, input);
  const access = await supabase.rpc("can_access_warehouse", {
    p_org_id: org.id,
    p_warehouse_id: input.warehouseId,
  });
  if (access.error || !access.data) {
    throw new Error("El depósito Meli no está asignado a tu usuario.");
  }
  const data = await loadCommercialData(admin, org.id, input);
  return buildMeliSalePlan({ input, ...data });
}

export async function previewMercadoLibreSale(rawInput: CreateMeliSaleInput) {
  const context = await requireMeliWriteContext(rawInput);
  const plan = await prepareNewMeliSale(context);
  return {
    total: plan.total_amount,
    globalDiscount: plan.global_discount_amount,
    taxes: plan.items
      .flatMap((item) => item.taxes)
      .map((tax) => ({
        name: tax.name,
        rate: tax.rate,
        amount: tax.tax_amount,
      })),
  };
}

/** ARCA and financial posting are separate from this commercial transaction. */
export async function createMercadoLibreSale(
  rawInput: CreateMeliSaleInput
): Promise<MeliSaleResult> {
  const context = await requireMeliWriteContext(rawInput);
  const { input, org, admin, actorId } = context;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  const existing = await admin
    .from("sales_orders")
    .select("id")
    .eq("organization_id", org.id)
    .eq("sales_channel", "MERCADO_LIBRE")
    .eq("marketplace_idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existing.error) {
    throw new Error("No se pudo verificar el intento anterior.");
  }
  if (existing.data) {
    return commit(admin, org.id, actorId, {
      key: input.idempotencyKey,
      payload: { input_fingerprint: fingerprint },
    });
  }
  const plan = await prepareCheckedMeliSale(context);
  return commit(admin, org.id, actorId, {
    key: input.idempotencyKey,
    payload: { ...plan, input_fingerprint: fingerprint },
  });
}

async function prepareCheckedMeliSale(
  context: Awaited<ReturnType<typeof requireMeliWriteContext>>
) {
  try {
    const plan = await prepareNewMeliSale(context);
    if (
      context.input.expectedTotal !== undefined &&
      context.input.expectedTotal !== plan.total_amount
    ) {
      throw new Error(
        "Cambió el total de la venta. Volvé a verificar los importes antes de confirmar."
      );
    }
    return plan;
  } catch (error) {
    throw new MeliConfirmationError(
      error instanceof Error ? error.message : "No se pudo verificar la venta.",
      true
    );
  }
}
