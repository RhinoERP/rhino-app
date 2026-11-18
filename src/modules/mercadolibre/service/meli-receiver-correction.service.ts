import "server-only";
import { z } from "zod";
import { createTypedAdminClient } from "@/lib/supabase/admin-client";
import { requireAuth } from "@/lib/supabase/auth";
import { validateCuit } from "@/modules/arca/validation";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { meliReceiverSchema } from "../types";
import { getMeliSale } from "./meli-read.service";

export const meliReceiverCorrectionSchema = z.object({
  saleId: z.uuid(),
  expectedUpdatedAt: z.string().min(1),
  receiver: meliReceiverSchema,
  reason: z
    .string()
    .trim()
    .min(5, "Explicá el motivo de la corrección.")
    .max(500),
});

export async function correctMeliReceiver(orgSlug: string, raw: unknown) {
  await ensure("mercadolibre.invoice", orgSlug);
  const input = meliReceiverCorrectionSchema.parse(raw);
  const auth = await requireAuth();
  if (!auth) {
    throw new Error("No autorizado.");
  }
  const sale = await getMeliSale(orgSlug, input.saleId);
  if (!sale || sale.status !== "DELIVERED") {
    throw new Error("Venta Meli no encontrada o fuera de tus depósitos.");
  }
  if (!["not_requested", "error"].includes(sale.arca_status)) {
    throw new Error(
      "Solo se puede corregir el receptor antes de emitir o tras un rechazo confirmado."
    );
  }
  if (sale.updated_at !== input.expectedUpdatedAt) {
    throw new Error(
      "La venta cambió. Actualizá el detalle antes de corregir el receptor."
    );
  }
  if (input.receiver.tax_condition !== sale.receiver.tax_condition) {
    throw new Error(
      "Esta corrección conserva la condición fiscal y el tipo de comprobante de la venta."
    );
  }
  if (input.receiver.document_type === "CUIT") {
    validateCuit(input.receiver.document_number, "CUIT del comprador");
  }
  const admin = createTypedAdminClient();
  const current = await admin
    .from("sales_orders")
    .select(
      "organization_id, commercial_snapshot, arca_request_json, arca_last_error"
    )
    .eq("organization_id", sale.organizationId)
    .eq("id", sale.id)
    .eq("sales_channel", "MERCADO_LIBRE")
    .eq("updated_at", input.expectedUpdatedAt)
    .eq("warehouse_id", sale.warehouse_id)
    .maybeSingle();
  if (current.error || !current.data) {
    throw new Error(
      "No se pudo recuperar la versión de la venta para corregirla."
    );
  }
  const snapshot = current.data.commercial_snapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("La venta no tiene un snapshot comercial válido.");
  }
  const history = snapshot.meli_receiver_corrections;
  const now = new Date().toISOString();
  const result = await admin
    .from("sales_orders")
    .update({
      fiscal_receiver_snapshot: input.receiver,
      commercial_snapshot: {
        ...snapshot,
        meli_receiver_corrections: [
          ...(Array.isArray(history) ? history : []),
          {
            actor_id: auth.userId,
            at: now,
            reason: input.reason,
            previous: sale.receiver,
            receiver: input.receiver,
            rejected_request: current.data.arca_request_json,
            last_error: current.data.arca_last_error,
          },
        ],
      },
      updated_at: now,
    })
    .eq("organization_id", current.data.organization_id)
    .eq("sales_channel", "MERCADO_LIBRE")
    .eq("id", sale.id)
    .eq("updated_at", input.expectedUpdatedAt)
    .in("arca_status", ["not_requested", "error"])
    .select("id")
    .maybeSingle();
  if (result.error || !result.data) {
    throw new Error(
      "No se guardó la corrección: la venta cambió o inició su emisión. Actualizá el detalle."
    );
  }
  return { saleId: sale.id };
}
