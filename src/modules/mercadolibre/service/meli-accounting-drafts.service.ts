import "server-only";
import { z } from "zod";
import { listMeliJournalEntriesByOriginServer } from "@/lib/accounting-server";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { requireAuth } from "@/lib/supabase/auth";
import { guardOrganizationModuleAccess } from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { MeliConfirmationError } from "../errors";
import { MELI_PAYMENT_READ_PERMISSIONS } from "../permissions";
import { meliAccountingBreakdownSchema } from "../utils/accounting-breakdown";

const draftInput = z
  .object({
    paymentId: z.uuid(),
    idempotencyKey: z.uuid(),
    expectedVersion: z.number().int().min(0).max(2_147_483_646),
    breakdown: meliAccountingBreakdownSchema,
    evidence: z.string().trim().max(2000),
  })
  .strict();

const draftResult = z
  .array(
    z.object({
      draft_id: z.uuid(),
      version: z.number().int().positive(),
      idempotent: z.boolean(),
    })
  )
  .length(1);

const draftHistory = z.array(
  z.object({
    id: z.uuid(),
    version: z.number().int().positive(),
    active: z.boolean(),
    request_payload: z
      .object({
        breakdown: meliAccountingBreakdownSchema,
        evidence: z.string().max(2000),
      })
      .strict(),
    gross_amount: z.string(),
    currency: z.enum(["ARS", "USD"]),
    payment_date: z.iso.date(),
    created_by: z.uuid(),
    created_at: z.iso.datetime({ offset: true }),
  })
);

const rolledBackCodes = new Set([
  "P0001",
  "22023",
  "22P02",
  "23503",
  "23505",
  "23514",
  "42501",
  "40001",
  "40P01",
  "55P03",
]);

async function accountingContext(orgSlug: string) {
  await ensure("mercadolibre.accounting.manage", orgSlug);
  await ensure(MELI_PAYMENT_READ_PERMISSIONS, orgSlug);
  await guardOrganizationModuleAccess(orgSlug, "pos");
  const auth = await requireAuth();
  if (!auth) {
    throw new Error("No autorizado.");
  }
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    throw new Error("Organización no encontrada.");
  }

  return { admin: createAdminClient(), actorId: auth.userId, orgId: org.id };
}

export async function listMeliAccountingDrafts(
  orgSlug: string,
  paymentId: string
) {
  const parsedPaymentId = z.uuid().parse(paymentId);
  const { admin, actorId, orgId } = await accountingContext(orgSlug);
  const result = await admin.rpc("list_meli_accounting_breakdown_drafts", {
    p_org_id: orgId,
    p_actor_id: actorId,
    p_payment_id: parsedPaymentId,
  });
  if (result.error) {
    throw new Error(
      `No se pudo consultar el historial del desglose: ${result.error.message}`
    );
  }
  return draftHistory.parse(result.data);
}

export async function listMeliPaymentJournalEntries(
  orgSlug: string,
  paymentId: string
) {
  const parsedPaymentId = z.uuid().parse(paymentId);
  const { admin, actorId, orgId } = await accountingContext(orgSlug);
  const access = await admin.rpc("list_meli_accounting_breakdown_drafts", {
    p_org_id: orgId,
    p_actor_id: actorId,
    p_payment_id: parsedPaymentId,
  });
  if (access.error) {
    throw new Error(
      `No se pudo verificar el acceso al cobro: ${access.error.message}`
    );
  }
  draftHistory.parse(access.data);
  return await listMeliJournalEntriesByOriginServer({
    orgId,
    referenciaId: parsedPaymentId,
    referenciaTabla: "mercadolibre_payments",
  });
}

export async function saveMeliAccountingDraft(orgSlug: string, raw: unknown) {
  const input = draftInput.parse(raw);
  const { admin, actorId, orgId } = await accountingContext(orgSlug);
  let result: Awaited<ReturnType<typeof admin.rpc>>;
  try {
    result = await admin.rpc("save_meli_accounting_breakdown_draft", {
      p_org_id: orgId,
      p_actor_id: actorId,
      p_payment_id: input.paymentId,
      p_idempotency_key: input.idempotencyKey,
      p_expected_version: input.expectedVersion,
      p_breakdown: input.breakdown,
      p_evidence: input.evidence,
    });
  } catch {
    throw new MeliConfirmationError(
      "No se obtuvo respuesta del desglose. Reintentá con los mismos datos y clave.",
      false
    );
  }
  if (result.error) {
    const canEdit = rolledBackCodes.has(result.error.code);
    throw new MeliConfirmationError(
      canEdit
        ? result.error.message
        : "No se pudo confirmar el desglose. Reintentá con los mismos datos y clave.",
      canEdit
    );
  }
  const parsed = draftResult.safeParse(result.data);
  if (!parsed.success) {
    throw new MeliConfirmationError(
      "No se recibió una confirmación verificable. Reintentá con los mismos datos y clave.",
      false
    );
  }
  return parsed.data[0];
}
