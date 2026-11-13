"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { truncateMoney } from "@/lib/decimal";
import { createTypedAdminClient as createAdminClient } from "@/lib/supabase/admin-client";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  loadSavedRemittances,
  remittanceHeaderSnapshotSchema,
} from "../server/order-remittance-documents.service";
import { prepareOrderRemittancesAction } from "./prepare-order-remittances.action";

const documentInputSchema = z.object({
  number: z.string().trim().max(100).default(""),
  packageCount: z.number().int().min(0).max(2_147_483_647).nullable(),
  declaredValue: z
    .number()
    .finite()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER / 100)
    .nullable()
    .refine(
      (value) => value === null || truncateMoney(value) === value,
      "El valor declarado admite hasta dos decimales."
    ),
});
const confirmOrderRemittancesSchema = z.object({
  orgSlug: z.string().trim().min(1),
  childOrderIds: z.array(z.uuid()).min(1),
  sourceFingerprint: z.string().regex(/^[a-f0-9]{32}$/),
  idempotencyKey: z.uuid(),
  automaticNumbering: z.boolean(),
  documents: z.array(documentInputSchema).min(1),
});
export type ConfirmOrderRemittancesInput = z.input<
  typeof confirmOrderRemittancesSchema
>;

function serializeJson(value: unknown) {
  const serialized: unknown = JSON.parse(JSON.stringify(value));
  return z.json().parse(serialized);
}

async function buildDocumentPayload(
  input: z.output<typeof confirmOrderRemittancesSchema>,
  orgId: string,
  actorId: string
) {
  const admin = createAdminClient();
  const existing = await admin
    .from("order_remittance_batches")
    .select("id, parent_order_id, created_by")
    .eq("organization_id", orgId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existing.error) {
    throw new Error(existing.error.message);
  }
  if (existing.data) {
    if (existing.data.created_by !== actorId) {
      throw new Error("La confirmación pertenece a otro usuario.");
    }
    const refs = await admin
      .from("order_remittances")
      .select("id")
      .eq("organization_id", orgId)
      .eq("batch_id", existing.data.id)
      .order("document_position");
    if (refs.error) {
      throw new Error(refs.error.message);
    }
    const saved = await loadSavedRemittances(
      input.orgSlug,
      refs.data.map((row) => row.id)
    );
    if (saved.length !== input.documents.length) {
      throw new Error("Cambió la cantidad de remitos del intento original.");
    }
    return {
      parentOrderId: existing.data.parent_order_id,
      documents: saved.map((document, index) => ({
        document_number: input.automaticNumbering
          ? null
          : input.documents[index].number,
        package_count: input.documents[index].packageCount,
        declared_value: input.documents[index].declaredValue,
        currency: document.currency,
        header_snapshot: document.header_snapshot,
        lines: [...document.lines]
          .sort((a, b) => a.line_position - b.line_position)
          .map((line) => ({
            line_position: line.line_position,
            product_id: line.product_id,
            product_variant_id: line.product_variant_id,
            sku: line.sku,
            product_name: line.product_name,
            brand: line.brand,
            variant_name: line.variant_name,
            unit_of_measure: line.unit_of_measure,
            quantity: line.quantity,
            weight_quantity: line.weight_quantity,
            unit_price: line.unit_price,
            subtotal: line.subtotal,
            discount_percentage: line.discount_percentage,
            extras_snapshot: line.extras_snapshot,
            sources: [...line.sources]
              .sort((a, b) =>
                a.quote_item_id < b.quote_item_id
                  ? -1
                  : Number(a.quote_item_id > b.quote_item_id)
              )
              .map((source) => ({
                order_id: source.order_id,
                quote_item_id: source.quote_item_id,
                quantity: source.quantity,
              })),
          })),
      })),
    };
  }
  const prepared = await prepareOrderRemittancesAction({
    orgSlug: input.orgSlug,
    childOrderIds: input.childOrderIds,
  });
  if (!prepared.success) {
    throw new Error(prepared.error);
  }
  const plan = prepared.data;
  if (
    plan.sourceFingerprint !== input.sourceFingerprint ||
    plan.documents.length !== input.documents.length
  ) {
    throw new Error(
      "El despacho cambió. Actualizá la preparación antes de confirmar."
    );
  }
  return {
    parentOrderId: plan.parentOrderId,
    documents: plan.documents.map((document, index) => ({
      document_number: input.automaticNumbering
        ? null
        : input.documents[index].number,
      package_count: input.documents[index].packageCount,
      declared_value: input.documents[index].declaredValue,
      currency: plan.header.currency ?? "ARS",
      header_snapshot: remittanceHeaderSnapshotSchema.parse({
        remittance: plan.header,
        carrierName: plan.carrierName,
        purchaseOrderNumber: null,
      }),
      lines: document.lines,
    })),
  };
}

export async function confirmOrderRemittancesAction(
  rawInput: ConfirmOrderRemittancesInput
) {
  try {
    const input = confirmOrderRemittancesSchema.parse(rawInput);
    await ensure("orders.dispatch", input.orgSlug);
    if (
      !input.automaticNumbering &&
      input.documents.some((document) => !document.number)
    ) {
      throw new Error("Completá el número de cada remito.");
    }
    if (new Set(input.childOrderIds).size !== input.childOrderIds.length) {
      throw new Error("La selección contiene subpedidos repetidos.");
    }
    const org = await getOrganizationBySlug(input.orgSlug);
    if (!org) {
      throw new Error("Organización no encontrada.");
    }
    const supabase = await createClient();
    const auth = await supabase.auth.getUser();
    if (auth.error || !auth.data.user) {
      throw new Error("Sesión inválida.");
    }
    const payload = await buildDocumentPayload(
      input,
      org.id,
      auth.data.user.id
    );
    const result = await createAdminClient().rpc(
      "commit_order_remittance_documents",
      {
        p_org_id: org.id,
        p_actor_id: auth.data.user.id,
        p_parent_order_id: payload.parentOrderId,
        p_order_ids: [...input.childOrderIds].sort(),
        p_idempotency_key: input.idempotencyKey,
        p_expected_source_fingerprint: input.sourceFingerprint,
        p_automatic_numbering: input.automaticNumbering,
        p_documents: serializeJson(payload.documents),
      }
    );
    if (result.error) {
      throw new Error(result.error.message);
    }
    if (!result.data.length) {
      throw new Error("No se devolvieron los remitos confirmados.");
    }
    for (const path of [
      "despacho",
      "pedidos",
      `pedidos/${payload.parentOrderId}`,
      "ventas",
      "cobranzas",
    ]) {
      revalidatePath(`/org/${input.orgSlug}/${path}`);
    }
    return { success: true as const, documents: result.data };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo confirmar el despacho.",
    };
  }
}
