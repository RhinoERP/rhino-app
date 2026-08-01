import "server-only";

import { buildNdVenta } from "@/lib/accounting-client";
import {
  confirmAccountingEvent,
  previewAccountingEvent,
} from "@/lib/accounting-server";
import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { isAccountingIntegrationEnabled } from "@/modules/accounting/service/accounting-integration.service";
import type { AnyEvento } from "@/modules/accounting/types";
import { getOrgSettings } from "@/modules/organizations/service/org-settings.service";
import {
  getOrganizationBySlug,
  getOrganizationLayoutData,
} from "@/modules/organizations/service/organizations.service";
import type { Database, Json } from "@/types/supabase";
import {
  type ArcaCreditNoteLoadedSale,
  type ArcaCreditNoteLoadedTax,
  buildArcaDebitNoteVoucherRequest,
  mapInvoiceTypeToArcaDebitNoteVoucherType,
  resolveAssociatedVoucherDate,
} from "../credit-note-invoice-payload";
import {
  ArcaAuthorizationError,
  ArcaConnectionError,
  ArcaValidationError,
  sanitizeArcaErrorMessage,
} from "../errors";
import { normalizeArcaTaxCode } from "../tax-codes";
import type { ArcaDebitNoteInvoiceResult } from "../types";
import { validateOrganizationCuit } from "../validation";
import {
  createArcaClientFromCredentials,
  isArcaCertificateExpired,
  resolveArcaOrganizationCredentials,
} from "./client-factory";
import { toArcaStatus } from "./settings.service";

type InvoiceType = Database["public"]["Enums"]["invoice_type"];
type UntypedSupabase = {
  // biome-ignore lint/suspicious/noExplicitAny: migration-owned tables until generated types are refreshed.
  from: (table: string) => any;
  // biome-ignore lint/suspicious/noExplicitAny: migration-owned RPC until generated types are refreshed.
  rpc: (fn: string, args?: unknown) => any;
};
type ArcaClient = ReturnType<typeof createArcaClientFromCredentials>;

type LoadedDebitNote = {
  id: string;
  organizationId: string;
  salesOrderId: string;
  customerId: string;
  debitNoteNumber: string;
  amount: number;
  invoiceType: InvoiceType;
  issueDate: string;
  status: "draft" | "pending" | "verifying" | "authorized" | "error";
  arcaCae: string | null;
  arcaCaeExpiresAt: string | null;
  arcaAuthorizedAt: string | null;
  arcaPointOfSale: number | null;
  arcaVoucherNumber: number | null;
  arcaReservedVoucherNumber: number | null;
  arcaVoucherTypeCode: number | null;
  arcaLastError: string | null;
  arcaRequestJson: Json | null;
  arcaResponseJson: Json | null;
  taxes: ArcaCreditNoteLoadedTax[];
  items: Array<{
    netAmount: number;
    taxAmount: number;
    taxes: Array<{
      name: string;
      taxAmount: number;
      taxCodeSnapshot: string | null;
    }>;
  }>;
};

type LoadedSale = ArcaCreditNoteLoadedSale & {
  status: string;
  arcaStatus: string;
  arcaCae: string | null;
};

const VOUCHER_INFO_TIMEOUT_MS = 4000;
const DATE_REGEX = /^\d{8}$/;
const COMPACT_DATE_TO_ISO_REGEX = /^(\d{4})(\d{2})(\d{2})$/;
const AMBIGUOUS_ARCA_FAILURE_REGEX =
  /timeout|timed out|network|socket|econn|etimedout|fetch|unavailable/i;

function db(client: Awaited<ReturnType<typeof createClient>>): UntypedSupabase {
  return client as unknown as UntypedSupabase;
}
function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}
function normalizeExpiry(value: string) {
  const date = DATE_REGEX.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : value;
  const parsed = new Date(date.includes("T") ? date : `${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new ArcaConnectionError(
      "ARCA devolvió un vencimiento de CAE inválido."
    );
  }
  return parsed.toISOString();
}

async function assertDebitNoteFiscalAccess(orgSlug: string) {
  const [org, layout] = await Promise.all([
    getOrganizationBySlug(orgSlug),
    getOrganizationLayoutData(orgSlug),
  ]);
  if (!(org?.id && layout)) {
    throw new ArcaAuthorizationError("No tenés acceso a la organización.");
  }
  const allowed =
    layout.permissions.includes("organization.admin") ||
    (["debitnotes.manage", "sales.read", "arca.read"] as const).every(
      (permission) => layout.permissions.includes(permission)
    );
  if (!allowed) {
    throw new ArcaAuthorizationError(
      "Necesitás acceso a Ventas, ARCA y Notas de Débito para emitir."
    );
  }
  return org;
}

function mapTax(row: Record<string, unknown>): ArcaCreditNoteLoadedTax {
  const tax = Array.isArray(row.tax) ? row.tax[0] : row.tax;
  return {
    id: String(row.id ?? ""),
    taxId: (row.tax_id as string | null) ?? null,
    name: String(row.name ?? "Impuesto"),
    rate: Number(row.rate ?? 0),
    baseAmount: truncateMoney(Number(row.base_amount ?? 0)),
    taxAmount: truncateMoney(Number(row.tax_amount ?? 0)),
    taxCodeSnapshot: (row.tax_code_snapshot as string | null) ?? null,
    currentTaxCode:
      tax && typeof tax === "object"
        ? ((tax as { code?: string }).code ?? null)
        : null,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: loads the fiscal aggregate in one place.
async function loadContext(orgSlug: string, debitNoteId: string) {
  const organization = await assertDebitNoteFiscalAccess(orgSlug);
  const client = await createClient();
  const { data: rawNote, error: noteError } = await db(client)
    .from("debit_notes")
    .select(
      "*, debit_note_taxes(id, tax_id, name, rate, base_amount, tax_amount, tax_code_snapshot, tax:taxes(code)), debit_note_items(net_amount, tax_amount, debit_note_item_taxes(name, tax_amount, tax_code_snapshot))"
    )
    .eq("organization_id", organization.id)
    .eq("id", debitNoteId)
    .maybeSingle();
  if (noteError || !rawNote) {
    throw new ArcaValidationError("Nota de Débito no encontrada.");
  }
  const note: LoadedDebitNote = {
    id: rawNote.id,
    organizationId: rawNote.organization_id,
    salesOrderId: rawNote.sales_order_id,
    customerId: rawNote.customer_id,
    debitNoteNumber: rawNote.debit_note_number,
    amount: truncateMoney(Number(rawNote.amount)),
    invoiceType: rawNote.invoice_type,
    issueDate: rawNote.issue_date,
    status: rawNote.status,
    arcaCae: rawNote.arca_cae ?? null,
    arcaCaeExpiresAt: rawNote.arca_cae_expires_at ?? null,
    arcaAuthorizedAt: rawNote.arca_authorized_at ?? null,
    arcaPointOfSale: rawNote.arca_point_of_sale ?? null,
    arcaVoucherNumber: rawNote.arca_voucher_number ?? null,
    arcaReservedVoucherNumber: rawNote.arca_reserved_voucher_number ?? null,
    arcaVoucherTypeCode: rawNote.arca_voucher_type_code ?? null,
    arcaLastError: rawNote.arca_last_error ?? null,
    arcaRequestJson: rawNote.arca_request_json ?? null,
    arcaResponseJson: rawNote.arca_response_json ?? null,
    taxes: ((rawNote.debit_note_taxes ?? []) as Record<string, unknown>[]).map(
      mapTax
    ),
    items: ((rawNote.debit_note_items ?? []) as Record<string, unknown>[]).map(
      (item) => ({
        netAmount: truncateMoney(Number(item.net_amount ?? 0)),
        taxAmount: truncateMoney(Number(item.tax_amount ?? 0)),
        taxes: (
          (item.debit_note_item_taxes ?? []) as Record<string, unknown>[]
        ).map((tax) => ({
          name: String(tax.name ?? "Impuesto"),
          taxAmount: truncateMoney(Number(tax.tax_amount ?? 0)),
          taxCodeSnapshot: (tax.tax_code_snapshot as string | null) ?? null,
        })),
      })
    ),
  };
  const { data: rawSale, error: saleError } = await client
    .from("sales_orders")
    .select(`
    id, status, sale_date, invoice_type, total_amount, arca_status, arca_cae, arca_point_of_sale, arca_voucher_number, arca_voucher_type_code, arca_request_json,
    customer:customers(cuit, tax_condition), taxes:sales_order_taxes(id, tax_id, name, rate, base_amount, tax_amount, tax_code_snapshot, tax:taxes(code))
  `)
    .eq("organization_id", organization.id)
    .eq("id", note.salesOrderId)
    .maybeSingle();
  if (saleError || !rawSale) {
    throw new ArcaValidationError("Factura original no encontrada.");
  }
  const customer = Array.isArray(rawSale.customer)
    ? rawSale.customer[0]
    : rawSale.customer;
  if (
    !(
      rawSale.arca_point_of_sale &&
      rawSale.arca_voucher_number &&
      rawSale.arca_voucher_type_code &&
      customer
    )
  ) {
    throw new ArcaValidationError(
      "La factura original no conserva sus datos fiscales ARCA."
    );
  }
  const sale: LoadedSale = {
    id: rawSale.id,
    status: rawSale.status,
    saleDate: rawSale.sale_date,
    invoiceType: rawSale.invoice_type,
    totalAmount: truncateMoney(Number(rawSale.total_amount)),
    arcaStatus: rawSale.arca_status ?? "not_requested",
    arcaCae: rawSale.arca_cae ?? null,
    arcaPointOfSale: rawSale.arca_point_of_sale,
    arcaVoucherNumber: rawSale.arca_voucher_number,
    arcaVoucherTypeCode: rawSale.arca_voucher_type_code,
    arcaRequestJson: rawSale.arca_request_json ?? null,
    customer: {
      cuit: customer.cuit ?? null,
      taxCondition: customer.tax_condition ?? null,
    },
    taxes: ((rawSale.taxes ?? []) as Record<string, unknown>[]).map(mapTax),
  };
  return { organization, client, note, sale };
}

function result(
  note: LoadedDebitNote,
  idempotent = false,
  accountingPayload: AnyEvento | null = null
): ArcaDebitNoteInvoiceResult {
  return {
    debitNoteId: note.id,
    status: note.status,
    cae: note.arcaCae,
    caeExpiresAt: note.arcaCaeExpiresAt,
    authorizedAt: note.arcaAuthorizedAt,
    pointOfSale: note.arcaPointOfSale,
    voucherNumber: note.arcaVoucherNumber,
    voucherTypeCode: note.arcaVoucherTypeCode,
    lastError: note.arcaLastError,
    requestJson: note.arcaRequestJson,
    responseJson: note.arcaResponseJson,
    idempotent,
    accountingPayload,
  };
}

async function persistDebitNoteAccounting(params: {
  orgSlug: string;
  note: LoadedDebitNote;
}): Promise<AnyEvento | null> {
  try {
    if (!(await isAccountingIntegrationEnabled(params.orgSlug))) {
      return null;
    }

    const event = buildNdVenta({
      id: params.note.id,
      organizationId: params.note.organizationId,
      customerId: params.note.customerId,
      salesOrderId: params.note.salesOrderId,
      debitNoteNumber: params.note.debitNoteNumber,
      issueDate: params.note.issueDate,
      amount: params.note.amount,
      items: params.note.items,
    });
    const settings = await getOrgSettings(params.orgSlug);

    if (settings.automatic_accounting_enabled) {
      try {
        const preview = await previewAccountingEvent(event);
        if (preview.estadoImputacion === "COMPLETO") {
          await confirmAccountingEvent(event);
          return null;
        }
      } catch (error) {
        console.error(
          "No se pudo automatizar el asiento de la ND; se enviará a revisión manual",
          error
        );
      }
    }

    return event;
  } catch (error) {
    console.error(
      "La ND fue autorizada, pero no se pudo preparar su asiento contable",
      error
    );
    return null;
  }
}

async function addEvent(
  client: Awaited<ReturnType<typeof createClient>>,
  params: {
    orgId: string;
    noteId: string;
    type: string;
    from: string;
    to: string;
    metadata?: Json;
  }
) {
  const { data: auth } = await client.auth.getUser();
  await db(client)
    .from("debit_note_events")
    .insert({
      organization_id: params.orgId,
      debit_note_id: params.noteId,
      event_type: params.type,
      from_status: params.from,
      to_status: params.to,
      actor_id: auth.user?.id ?? null,
      metadata: params.metadata ?? {},
    });
}

async function getVoucher(
  client: ArcaClient,
  voucherNumber: number,
  pointOfSale: number,
  voucherTypeCode: number
): Promise<{
  CAE: string;
  CAEFchVto: string;
  voucherNumber: number;
  raw: unknown;
} | null> {
  try {
    const raw = await Promise.race([
      client.ElectronicBilling.getVoucherInfo(
        voucherNumber,
        pointOfSale,
        voucherTypeCode
      ),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), VOUCHER_INFO_TIMEOUT_MS)
      ),
    ]);
    if (!(raw && typeof raw === "object")) {
      return null;
    }
    const row = raw as Record<string, unknown>;
    const cae = row.CodAutorizacion ?? row.CAE;
    const expires = row.FchVto ?? row.CAEFchVto;
    return cae && expires
      ? { CAE: String(cae), CAEFchVto: String(expires), voucherNumber, raw }
      : null;
  } catch {
    return null;
  }
}

async function finalize(params: {
  client: Awaited<ReturnType<typeof createClient>>;
  orgSlug: string;
  note: LoadedDebitNote;
  pointOfSale: number;
  voucherTypeCode: number;
  authorization: { CAE: string; CAEFchVto: string; voucherNumber: number };
  requestJson: Json;
  responseJson: Json;
  sale: LoadedSale;
}): Promise<AnyEvento | null> {
  const associatedDate = resolveAssociatedVoucherDate(params.sale);
  const { error } = await db(params.client).rpc(
    "finalize_debit_note_authorization",
    {
      p_debit_note_id: params.note.id,
      p_organization_id: params.note.organizationId,
      p_point_of_sale: params.pointOfSale,
      p_voucher_type_code: params.voucherTypeCode,
      p_voucher_number: params.authorization.voucherNumber,
      p_cae: params.authorization.CAE,
      p_cae_expires_at: normalizeExpiry(params.authorization.CAEFchVto),
      p_associated_voucher_type_code: params.sale.arcaVoucherTypeCode,
      p_associated_point_of_sale: params.sale.arcaPointOfSale,
      p_associated_voucher_number: params.sale.arcaVoucherNumber,
      p_associated_voucher_date: String(associatedDate).replace(
        COMPACT_DATE_TO_ISO_REGEX,
        "$1-$2-$3"
      ),
      p_request_json: params.requestJson,
      p_response_json: params.responseJson,
    }
  );
  if (error) {
    throw new ArcaConnectionError(
      `ARCA autorizó la Nota de Débito, pero no se pudo persistir: ${error.message}`
    );
  }

  return await persistDebitNoteAccounting({
    orgSlug: params.orgSlug,
    note: params.note,
  });
}

async function markFailure(params: {
  client: Awaited<ReturnType<typeof createClient>>;
  note: LoadedDebitNote;
  status: "error" | "verifying";
  message: string;
  responseJson: Json | null;
}) {
  const { client, note, status, message, responseJson } = params;
  const { error } = await db(client)
    .from("debit_notes")
    .update({
      status,
      arca_last_error: message,
      arca_response_json: responseJson,
      updated_at: new Date().toISOString(),
    })
    .eq("id", note.id)
    .eq("organization_id", note.organizationId)
    .neq("status", "authorized");
  if (error) {
    throw new ArcaConnectionError(
      `No se pudo registrar el estado fiscal: ${error.message}`
    );
  }
  await addEvent(client, {
    orgId: note.organizationId,
    noteId: note.id,
    type: status === "verifying" ? "verification_required" : "emission_error",
    from: note.status,
    to: status,
    metadata: responseJson ?? {},
  });
}

export async function verifyDebitNoteEmission(params: {
  orgSlug: string;
  debitNoteId: string;
}): Promise<ArcaDebitNoteInvoiceResult> {
  const context = await loadContext(params.orgSlug, params.debitNoteId);
  if (context.note.status === "authorized") {
    return result(
      context.note,
      true,
      await persistDebitNoteAccounting({
        orgSlug: params.orgSlug,
        note: context.note,
      })
    );
  }
  if (
    !(
      context.note.arcaPointOfSale &&
      context.note.arcaVoucherTypeCode &&
      context.note.arcaReservedVoucherNumber
    )
  ) {
    return result(context.note);
  }
  const credentials = await resolveArcaOrganizationCredentials({
    organizationId: context.organization.id,
    organizationCuit: context.organization.cuit ?? null,
    actor: "system",
  });
  const arca = createArcaClientFromCredentials({
    cuit: validateOrganizationCuit(context.organization.cuit),
    cert: credentials.cert,
    key: credentials.key,
    environment: credentials.environment,
  });
  const authorized = await getVoucher(
    arca,
    context.note.arcaReservedVoucherNumber,
    context.note.arcaPointOfSale,
    context.note.arcaVoucherTypeCode
  );
  if (!authorized) {
    return result({ ...context.note, status: "verifying" });
  }
  const responseJson = toJson({
    authorization: authorized,
    voucherInfo: authorized.raw,
    reconciled: true,
  });
  const accountingPayload = await finalize({
    client: context.client,
    orgSlug: params.orgSlug,
    note: context.note,
    pointOfSale: context.note.arcaPointOfSale,
    voucherTypeCode: context.note.arcaVoucherTypeCode,
    authorization: authorized,
    requestJson: context.note.arcaRequestJson ?? {},
    responseJson,
    sale: context.sale,
  });
  return {
    ...result(context.note, false, accountingPayload),
    status: "authorized",
    cae: authorized.CAE,
    voucherNumber: authorized.voucherNumber,
    responseJson,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: emission deliberately keeps reservation and reconciliation together.
export async function emitDebitNote(params: {
  orgSlug: string;
  debitNoteId: string;
}): Promise<ArcaDebitNoteInvoiceResult> {
  const context = await loadContext(params.orgSlug, params.debitNoteId);
  const { note, sale, organization, client } = context;
  if (note.status === "authorized") {
    return result(
      note,
      true,
      await persistDebitNoteAccounting({ orgSlug: params.orgSlug, note })
    );
  }
  if (note.status === "pending") {
    throw new ArcaValidationError(
      "Ya hay una emisión fiscal en curso para esta Nota de Débito."
    );
  }
  if (note.status === "verifying") {
    return verifyDebitNoteEmission(params);
  }
  if (!["draft", "error"].includes(note.status)) {
    throw new ArcaValidationError(
      "La Nota de Débito no está lista para emitir."
    );
  }
  if (
    sale.status === "CANCELLED" ||
    sale.arcaStatus !== "authorized" ||
    !sale.arcaCae
  ) {
    throw new ArcaValidationError(
      "La factura original debe estar autorizada y vigente en ARCA."
    );
  }
  if (note.invoiceType !== sale.invoiceType) {
    throw new ArcaValidationError(
      "La Nota de Débito no coincide con el tipo fiscal de la factura origen."
    );
  }
  if (note.amount <= 0) {
    throw new ArcaValidationError(
      "El importe de la Nota de Débito debe ser mayor que cero."
    );
  }
  const hasIva = note.taxes.some((tax) =>
    normalizeArcaTaxCode(tax.taxCodeSnapshot)?.startsWith("IVA_")
  );
  if (note.invoiceType === "FACTURA_C" && note.taxes.length > 0) {
    throw new ArcaValidationError(
      "La Nota de Débito C no puede incluir IVA ni tributos."
    );
  }
  if (note.invoiceType !== "FACTURA_C" && !hasIva) {
    throw new ArcaValidationError(
      "La Nota de Débito debe incluir al menos un IVA con código ARCA válido."
    );
  }
  const voucherTypeCode = mapInvoiceTypeToArcaDebitNoteVoucherType(
    note.invoiceType
  );
  const credentials = await resolveArcaOrganizationCredentials({
    organizationId: organization.id,
    organizationCuit: organization.cuit ?? null,
    actor: "system",
  });
  if (toArcaStatus(credentials.settings.status) !== "connected") {
    throw new ArcaValidationError(
      "La configuración ARCA no está conectada. Revisala desde Configuración > ARCA."
    );
  }
  if (isArcaCertificateExpired(credentials.certExpiresAt)) {
    throw new ArcaValidationError("El certificado ARCA está vencido.");
  }
  const arca = createArcaClientFromCredentials({
    cuit: validateOrganizationCuit(organization.cuit),
    cert: credentials.cert,
    key: credentials.key,
    environment: credentials.environment,
  });
  const last = Number(
    await arca.ElectronicBilling.getLastVoucher(
      credentials.pointOfSale,
      voucherTypeCode
    )
  );
  if (!Number.isFinite(last)) {
    throw new ArcaConnectionError(
      "ARCA devolvió una numeración de comprobante inválida."
    );
  }
  const voucherNumber = last + 1;
  const request = {
    ...buildArcaDebitNoteVoucherRequest({
      creditNote: {
        id: note.id,
        amount: note.amount,
        invoiceType: note.invoiceType,
        taxes: note.taxes,
        useExplicitTaxes: true,
      },
      sale,
      pointOfSale: credentials.pointOfSale,
    }),
    CbteDesde: voucherNumber,
    CbteHasta: voucherNumber,
  };
  const requestJson = toJson({
    debitNoteId: note.id,
    saleId: sale.id,
    wsfeRequest: request,
  });
  const { data: locked, error: lockError } = await db(client)
    .from("debit_notes")
    .update({
      status: "pending",
      arca_point_of_sale: credentials.pointOfSale,
      arca_voucher_type_code: voucherTypeCode,
      arca_voucher_number: voucherNumber,
      arca_reserved_voucher_number: voucherNumber,
      arca_last_error: null,
      arca_request_json: requestJson,
      arca_response_json: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", note.id)
    .eq("organization_id", organization.id)
    .in("status", ["draft", "error"])
    .select("id")
    .maybeSingle();
  if (lockError) {
    throw new ArcaConnectionError(
      lockError.code === "23505"
        ? "El número fiscal fue reservado por otra emisión. Reintentá."
        : `No se pudo bloquear la Nota de Débito: ${lockError.message}`
    );
  }
  if (!locked) {
    throw new ArcaValidationError(
      "La Nota de Débito cambió de estado. Actualizá la pantalla antes de reintentar."
    );
  }
  await addEvent(client, {
    orgId: organization.id,
    noteId: note.id,
    type: "emission_started",
    from: note.status,
    to: "pending",
    metadata: requestJson,
  });
  try {
    const raw = await arca.ElectronicBilling.createVoucher(request);
    const authorization = {
      CAE: String(raw.CAE),
      CAEFchVto: String(raw.CAEFchVto),
      voucherNumber,
    };
    const checked = await getVoucher(
      arca,
      voucherNumber,
      credentials.pointOfSale,
      voucherTypeCode
    );
    const responseJson = toJson({
      authorization,
      voucherInfo: checked?.raw ?? null,
      voucherInfoPending: !checked,
    });
    const accountingPayload = await finalize({
      client,
      orgSlug: params.orgSlug,
      note: { ...note, status: "pending" },
      pointOfSale: credentials.pointOfSale,
      voucherTypeCode,
      authorization,
      requestJson,
      responseJson,
      sale,
    });
    return {
      ...result(note, false, accountingPayload),
      status: "authorized",
      cae: authorization.CAE,
      caeExpiresAt: normalizeExpiry(authorization.CAEFchVto),
      authorizedAt: new Date().toISOString(),
      pointOfSale: credentials.pointOfSale,
      voucherNumber,
      voucherTypeCode,
      lastError: null,
      requestJson,
      responseJson,
    };
  } catch (error) {
    const reconciled = await getVoucher(
      arca,
      voucherNumber,
      credentials.pointOfSale,
      voucherTypeCode
    );
    if (reconciled) {
      const responseJson = toJson({
        authorization: reconciled,
        voucherInfo: reconciled.raw,
        reconciled: true,
      });
      const accountingPayload = await finalize({
        client,
        orgSlug: params.orgSlug,
        note: { ...note, status: "pending" },
        pointOfSale: credentials.pointOfSale,
        voucherTypeCode,
        authorization: reconciled,
        requestJson,
        responseJson,
        sale,
      });
      return {
        ...result(note, false, accountingPayload),
        status: "authorized",
        cae: reconciled.CAE,
        caeExpiresAt: normalizeExpiry(reconciled.CAEFchVto),
        authorizedAt: new Date().toISOString(),
        pointOfSale: credentials.pointOfSale,
        voucherNumber,
        voucherTypeCode,
        lastError: null,
        requestJson,
        responseJson,
      };
    }
    const message =
      sanitizeArcaErrorMessage(error) ||
      "No se pudo completar la emisión fiscal de la Nota de Débito.";
    const failureStatus = AMBIGUOUS_ARCA_FAILURE_REGEX.test(message)
      ? "verifying"
      : "error";
    await markFailure({
      client,
      note: { ...note, status: "pending" },
      status: failureStatus,
      message,
      responseJson: toJson({
        error: message,
        reconciliationPending: failureStatus === "verifying",
      }),
    });
    throw new ArcaConnectionError(
      failureStatus === "verifying"
        ? `${message} La emisión quedó en verificación para evitar duplicados.`
        : message
    );
  }
}
