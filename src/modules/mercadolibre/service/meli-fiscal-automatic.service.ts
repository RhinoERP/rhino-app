import "server-only";
import { z } from "zod";
import {
  inspectMeliInvoiceReceiptServer,
  listMeliFiscalAccountsServer,
} from "@/lib/accounting-server";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { requireAuth } from "@/lib/supabase/auth";
import { isMeliAccountingIntegrationEnabled } from "@/modules/accounting/service/accounting-integration.service";
import { guardOrganizationModuleAccess } from "@/modules/organizations/service/module-access.service";
import {
  getOrganizationBySlug,
  getOrganizationLayoutData,
} from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  canManageMeliAccounting,
  MELI_PAYMENT_READ_PERMISSIONS,
} from "../permissions";
import {
  assertAutomaticCreditMatchesInvoice,
  fiscalAutomaticAssignments,
  fiscalAutomaticMapping,
} from "../utils/accounting-fiscal-automatic";
import { buildMeliFiscalPreview } from "../utils/accounting-fiscal-preview";
import {
  getMeliFiscalAccountingSnapshot,
  getMeliInvoiceFiscalSnapshotForRecovery,
  inspectMeliInvoiceReceipt,
} from "./meli-fiscal-accounting-history.service";
import {
  inspectMeliFiscalDispatch,
  publishMeliFiscal,
} from "./meli-fiscal-preparation.service";

const originSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("invoice"), saleId: z.uuid() }).strict(),
  z
    .object({
      type: z.literal("creditNote"),
      saleId: z.uuid(),
      creditNoteId: z.uuid(),
    })
    .strict(),
]);

const initialAccountsSchema = z
  .object({
    currency: z.enum(["ARS", "USD"]),
    receivable: z.uuid(),
    revenue: z.uuid(),
    vat: z.uuid(),
  })
  .strict();

async function context(orgSlug: string) {
  await ensure("mercadolibre.accounting.manage", orgSlug);
  await ensure(MELI_PAYMENT_READ_PERMISSIONS, orgSlug);
  await guardOrganizationModuleAccess(orgSlug, "pos");
  if (!(await isMeliAccountingIntegrationEnabled(orgSlug))) {
    throw new Error("La integración contable Meli no está habilitada.");
  }
  const [auth, org] = await Promise.all([
    requireAuth(),
    getOrganizationBySlug(orgSlug),
  ]);
  if (!(auth && org)) {
    throw new Error("Usuario u organización no autorizados.");
  }
  return { admin: createAdminClient(), orgId: org.id, actorId: auth.userId };
}

export async function saveMeliFiscalAutomaticConfiguration(
  orgSlug: string,
  rawOrigin: unknown,
  rawAssignments: unknown
) {
  await ensure("organization.admin", orgSlug);
  const origin = originSchema.parse(rawOrigin);
  const { admin, orgId, actorId } = await context(orgSlug);
  const snapshot = await getMeliFiscalAccountingSnapshot(orgSlug, origin);
  const accounts = await listMeliFiscalAccountsServer(orgId);
  const assignments = z.record(z.string(), z.uuid()).parse(rawAssignments);
  buildMeliFiscalPreview(origin.type, snapshot, accounts, assignments);
  const receivable = accounts.find(
    (account) =>
      account.id.toLowerCase() === assignments.receivable?.toLowerCase()
  );
  if (receivable?.account_code !== "AR_DEUDORES_VENTAS") {
    throw new Error("La contrapartida debe ser la cuenta de deudores Meli.");
  }
  const mapping = fiscalAutomaticMapping(snapshot, assignments);
  const result = await admin.rpc("save_meli_fiscal_automatic_configuration", {
    p_org_id: orgId,
    p_actor_id: actorId,
    p_currency: snapshot.currency,
    p_accounts: mapping,
  });
  if (result.error) {
    throw new Error(`No se guardó la configuración: ${result.error.message}`);
  }
  return { currency: snapshot.currency };
}

export async function saveMeliFiscalInitialConfiguration(
  orgSlug: string,
  rawInput: unknown
) {
  await ensure("organization.admin", orgSlug);
  const input = initialAccountsSchema.parse(rawInput);
  const { admin, orgId, actorId } = await context(orgSlug);
  const accounts = await listMeliFiscalAccountsServer(orgId);
  for (const [code, id] of [
    ["AR_DEUDORES_VENTAS", input.receivable],
    ["VENTAS_MERCADO_LIBRE", input.revenue],
    ["IVA_DEBITO_FISCAL", input.vat],
  ] as const) {
    const matches = accounts.filter(
      (account) =>
        account.account_code === code &&
        account.activa &&
        account.permite_movimientos &&
        (account.moneda === input.currency || account.moneda === "AMBAS")
    );
    if (
      matches.length !== 1 ||
      matches[0].id.toLowerCase() !== id.toLowerCase()
    ) {
      throw new Error(
        `La cuenta ${code} cambió o no está disponible para ${input.currency}.`
      );
    }
  }
  const mapping = {
    receivable: input.receivable,
    net: input.revenue,
    exempt: input.revenue,
    nonTaxable: input.revenue,
    "vat:3": input.vat,
    "vat:4": input.vat,
    "vat:5": input.vat,
    "vat:6": input.vat,
    "vat:8": input.vat,
    "vat:9": input.vat,
  };
  const result = await admin.rpc("save_meli_fiscal_automatic_configuration", {
    p_org_id: orgId,
    p_actor_id: actorId,
    p_currency: input.currency,
    p_accounts: mapping,
  });
  if (result.error) {
    throw new Error(`No se guardó la configuración: ${result.error.message}`);
  }
  return { currency: input.currency };
}

export async function publishMeliFiscalAutomatically(
  orgSlug: string,
  rawOrigin: unknown
) {
  const origin = originSchema.parse(rawOrigin);
  const { admin, orgId } = await context(orgSlug);
  const snapshot = await getMeliFiscalAccountingSnapshot(orgSlug, origin);
  const originId =
    origin.type === "invoice" ? origin.saleId : origin.creditNoteId;
  const dispatch = await inspectMeliFiscalDispatch(orgSlug, origin);
  if (dispatch.dispatchStatus) {
    return await publishMeliFiscal(orgSlug, origin, {});
  }
  const [config, pending, accounts] = await Promise.all([
    admin
      .from("mercadolibre_fiscal_automatic_configurations")
      .select("accounts")
      .eq("organization_id", orgId)
      .eq("currency", snapshot.currency)
      .maybeSingle(),
    admin
      .from("mercadolibre_fiscal_automatic_pending")
      .select("request_key, sale_id")
      .eq("organization_id", orgId)
      .eq("origin_type", origin.type)
      .eq("origin_id", originId)
      .maybeSingle(),
    listMeliFiscalAccountsServer(orgId),
  ]);
  if (config.error || pending.error) {
    throw new Error(
      `No se pudo consultar la configuración o el pendiente fiscal: ${config.error?.message ?? pending.error?.message}`
    );
  }
  if (!config.data) {
    throw new Error(
      `No hay cuentas fiscales automáticas configuradas para ${snapshot.currency}.`
    );
  }
  const row = z
    .object({ request_key: z.uuid(), sale_id: z.uuid() })
    .nullable()
    .parse(pending.data);
  if (!row || row.sale_id.toLowerCase() !== origin.saleId.toLowerCase()) {
    throw new Error("No se encontró el pendiente durable del comprobante.");
  }
  const assignments = fiscalAutomaticAssignments(
    snapshot,
    config.data.accounts
  );
  buildMeliFiscalPreview(origin.type, snapshot, accounts, assignments);
  if (origin.type === "creditNote") {
    const [invoice, verified, receipt] = await Promise.all([
      getMeliInvoiceFiscalSnapshotForRecovery(orgSlug, origin.saleId),
      inspectMeliInvoiceReceipt(orgSlug, origin.saleId),
      inspectMeliInvoiceReceiptServer(orgId, origin.saleId),
    ]);
    if (
      !(verified && receipt) ||
      verified.journalEntryId.toLowerCase() !==
        receipt.journalEntryId.toLowerCase()
    ) {
      throw new Error("La factura Meli debe tener un asiento verificable.");
    }
    const invoiceAssignments = fiscalAutomaticAssignments(
      invoice,
      config.data.accounts
    );
    const invoiceProposal = buildMeliFiscalPreview(
      "invoice",
      invoice,
      accounts,
      invoiceAssignments
    );
    assertAutomaticCreditMatchesInvoice(
      snapshot,
      invoice,
      invoiceProposal,
      receipt
    );
  }
  return await publishMeliFiscal(orgSlug, origin, assignments, row.request_key);
}

export async function tryMeliFiscalAutomaticPublication(
  orgSlug: string,
  rawOrigin: unknown
): Promise<string | null> {
  try {
    if (!(await isMeliAccountingIntegrationEnabled(orgSlug))) {
      return null;
    }
    const layout = await getOrganizationLayoutData(orgSlug);
    if (!(layout && canManageMeliAccounting(layout.permissions))) {
      return "El usuario que emitió el comprobante no tiene permiso contable Meli; un usuario autorizado debe revisarlo.";
    }
    await publishMeliFiscalAutomatically(orgSlug, rawOrigin);
    return null;
  } catch (error) {
    console.error("La contabilización automática Meli quedó pendiente", error);
    return error instanceof Error
      ? error.message
      : "No se pudo confirmar la contabilización automática.";
  }
}
