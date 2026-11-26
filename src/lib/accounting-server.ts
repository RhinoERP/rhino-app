/**
 * Server-side accounting service client.
 * Calls the accounting Express service directly (bypasses the Next.js proxy),
 * so it can be used from Server Actions and server-side service functions.
 *
 * Do NOT import this file in client components — use accounting-client.ts instead.
 */
import "server-only";

import { z } from "zod";
import type {
  AnyEvento,
  InformalEntrySourceType,
  PreviewResponse,
} from "@/modules/accounting/types";
import {
  type fiscalJournalPayloadSchema,
  invoiceReceiptSchema,
} from "@/modules/mercadolibre/utils/accounting-invoice-receipt";
import {
  type MeliJournalOrigin,
  parseMeliJournalEntriesByOrigin,
} from "@/modules/mercadolibre/utils/accounting-origin";
import type { MeliPaymentRecoveryPayload } from "@/modules/mercadolibre/utils/accounting-payment-recovery";

const TIMEOUT_MS = 10_000;
const HTTP_NOT_FOUND = 404;

export class AccountingServiceError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AccountingServiceError";
    this.status = status;
  }
}

export function isAccountingNotFoundError(error: unknown): boolean {
  return (
    error instanceof AccountingServiceError && error.status === HTTP_NOT_FOUND
  );
}

function toServiceError(json: unknown, status: number): AccountingServiceError {
  return new AccountingServiceError(
    (json as { error?: string }).error ?? `Accounting service error: ${status}`,
    status
  );
}

function getServiceConfig(): { url: string; token: string } {
  const url = process.env.ACCOUNTING_SERVICE_URL;
  const token = process.env.ACCOUNTING_SERVICE_TOKEN;
  if (!(url && token)) {
    throw new Error(
      "Servicio contable no configurado (ACCOUNTING_SERVICE_URL / ACCOUNTING_SERVICE_TOKEN)"
    );
  }
  return { url, token };
}

async function servicePost<T>(path: string, body: unknown): Promise<T> {
  const { url, token } = getServiceConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${url}/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Token": token,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw toServiceError(json, res.status);
    }
    return (json as { data: T }).data;
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------
// previewAccountingEvent
// Llama POST /preview — resuelve el evento sin persistir.
// Retorna PreviewResponse con estadoImputacion COMPLETO | SUSPENSO.
// ------------------------------------------------------------
export async function previewAccountingEvent(
  evento: AnyEvento
): Promise<PreviewResponse> {
  return await servicePost<PreviewResponse>("preview", evento);
}

// ------------------------------------------------------------
// createInformalEntry
// Llama POST /eventos/informal — crea asiento en informal_entries.
// ------------------------------------------------------------
export async function createInformalEntry(
  evento: AnyEvento,
  sourceType: InformalEntrySourceType
): Promise<string> {
  const result = await servicePost<{ informalEntryId: string }>(
    "eventos/informal",
    { ...evento, source_type: sourceType }
  );
  return result.informalEntryId;
}

// ------------------------------------------------------------
// confirmAccountingEvent
// Llama POST /eventos — crea el asiento directo en journal_entries.
// Idempotente: misma idempotencyKey retorna el mismo asientoId.
// ------------------------------------------------------------
export async function confirmAccountingEvent(
  evento: AnyEvento
): Promise<string> {
  const result = await servicePost<{ asientoId: string }>("eventos", evento);
  return result.asientoId;
}

// ------------------------------------------------------------
// formalizarEntry
// Llama POST /informal-entries/:id/formalizar — crea asiento formal.
// Retorna el UUID del journal_entry creado.
// ------------------------------------------------------------
export async function formalizarEntry(
  informalEntryId: string,
  orgId: string
): Promise<string> {
  const result = await servicePost<{ journalEntryId: string }>(
    `informal-entries/${informalEntryId}/formalizar?org_id=${encodeURIComponent(orgId)}`,
    {}
  );
  return result.journalEntryId;
}

export async function cancelInformalEntry(
  informalEntryId: string,
  orgId: string
): Promise<void> {
  await servicePost<{ informalEntryId: string }>(
    `informal-entries/${informalEntryId}/cancelar?org_id=${encodeURIComponent(orgId)}`,
    {}
  );
}

export async function asentarInformalEntry(
  informalEntryId: string,
  orgId: string
): Promise<void> {
  await servicePost<{ informalEntryId: string }>(
    `informal-entries/${informalEntryId}/asentar?org_id=${encodeURIComponent(orgId)}`,
    {}
  );
}

export type InformalEntryReference = {
  id: string;
  referencia_id: string | null;
  referencia_tabla: string | null;
  source_type: string | null;
  estado_formalizacion: string;
};

// Llama GET /informal-entries/:id — retorna null si no existe en la organización.
export async function getInformalEntryServer(
  informalEntryId: string,
  orgId: string
): Promise<InformalEntryReference | null> {
  try {
    return await serviceGet<InformalEntryReference>(
      `informal-entries/${encodeURIComponent(informalEntryId)}?org_id=${encodeURIComponent(orgId)}`
    );
  } catch (error) {
    if (isAccountingNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function findJournalEntryIdByReferenceServer(params: {
  orgId: string;
  referenciaId: string;
  referenciaTabla: string;
  tipoEvento: string;
}): Promise<string | null> {
  const query = new URLSearchParams({
    org_id: params.orgId,
    referencia_id: params.referenciaId,
    referencia_tabla: params.referenciaTabla,
    tipo_evento: params.tipoEvento,
  });

  try {
    const result = await serviceGet<{ id: string }>(
      `asientos/by-reference?${query.toString()}`
    );
    return result.id;
  } catch (error) {
    if (isAccountingNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function listMeliJournalEntriesByOriginServer(
  origin: MeliJournalOrigin
) {
  const query = new URLSearchParams({
    org_id: origin.orgId,
    referencia_id: origin.referenciaId,
    referencia_tabla: origin.referenciaTabla,
  });
  const result = await serviceGet<unknown>(
    `asientos/by-origin?${query.toString()}`
  );
  return parseMeliJournalEntriesByOrigin(origin, result);
}

export async function findMeliPaymentJournalRequestServer(
  payload:
    | MeliPaymentRecoveryPayload
    | z.output<typeof fiscalJournalPayloadSchema>
) {
  const result = await servicePost<unknown>(
    "internal/meli/journal/lookup",
    payload
  );
  return z
    .object({ journalEntryId: z.uuid().nullable() })
    .strict()
    .parse(result).journalEntryId;
}

export async function publishMeliJournalServer(input: {
  saleId: string;
  payload:
    | MeliPaymentRecoveryPayload
    | z.output<typeof fiscalJournalPayloadSchema>;
}) {
  const result = await servicePost<unknown>(
    "internal/meli/journal/publish",
    input
  );
  return z.object({ journalEntryId: z.uuid() }).strict().parse(result)
    .journalEntryId;
}

export async function publishMeliPaymentReversalServer(input: {
  original: MeliPaymentRecoveryPayload;
  reversal: {
    orgId: string;
    originalEntryId: string;
    requestKey: string;
    date: string;
    description: string;
    actorId: string;
  };
}) {
  const result = await servicePost<unknown>(
    "internal/meli/reversal/publish",
    input
  );
  return z.object({ reversalEntryId: z.uuid() }).strict().parse(result)
    .reversalEntryId;
}

export async function findMeliPaymentReversalServer(payload: {
  orgId: string;
  originalEntryId: string;
  requestKey: string;
  date: string;
  description: string;
  actorId: string;
}) {
  const result = await servicePost<unknown>(
    "internal/meli/reversal/lookup",
    payload
  );
  return z
    .object({ reversalEntryId: z.uuid().nullable() })
    .strict()
    .parse(result).reversalEntryId;
}

export async function inspectMeliPaymentReversalSourceServer(input: {
  original: MeliPaymentRecoveryPayload;
  reversal: {
    orgId: string;
    originalEntryId: string;
    requestKey: string;
    date: string;
    description: string;
    actorId: string;
  };
}) {
  const result = await servicePost<unknown>(
    "internal/meli/reversal/source/inspect",
    input
  );
  return z
    .object({
      originalEntryId: z.uuid(),
      reversalEntryId: z.uuid().nullable(),
    })
    .strict()
    .parse(result);
}

export async function listMeliAccountReferencesServer(orgId: string) {
  const result = await serviceGet<unknown>(
    `cuentas?org_id=${encodeURIComponent(orgId)}`
  );
  return z
    .array(z.object({ id: z.uuid(), account_code: z.string().nullable() }))
    .parse(result);
}

export async function listMeliFiscalAccountsServer(orgId: string) {
  const result = await serviceGet<unknown>(
    `cuentas?org_id=${encodeURIComponent(orgId)}`
  );
  return z
    .array(
      z.object({
        id: z.uuid(),
        codigo: z.string(),
        nombre: z.string(),
        account_code: z.string().nullable(),
        tipo: z.string(),
        naturaleza: z.string(),
        activa: z.boolean(),
        permite_movimientos: z.boolean(),
        padre_id: z.uuid().nullable(),
        moneda: z.string(),
      })
    )
    .parse(result);
}

export async function inspectMeliInvoiceReceiptServer(
  orgId: string,
  saleId: string
) {
  const result = await servicePost<unknown>(
    "internal/meli/journal/invoice/inspect",
    { orgId, saleId }
  );
  return invoiceReceiptSchema.nullable().parse(result);
}

export async function inspectMeliPostingPeriodServer(
  orgId: string,
  date: string
) {
  const result = await servicePost<unknown>(
    "internal/meli/journal/period/inspect",
    {
      orgId,
      date,
    }
  );
  return z
    .object({ status: z.enum(["OPEN", "CLOSED", "UNCONFIGURED"]) })
    .strict()
    .parse(result);
}

export async function changeMeliPostingPeriodServer(input: {
  orgId: string;
  periodStart: string;
  expectedStatus: "UNCONFIGURED" | "OPEN" | "CLOSED";
  newStatus: "OPEN" | "CLOSED";
  actorId: string;
  reason: string;
  requestKey: string;
}) {
  const result = await servicePost<unknown>(
    "internal/meli/journal/period/change",
    input
  );
  const parsed = z
    .object({ status: z.enum(["OPEN", "CLOSED"]), idempotent: z.boolean() })
    .strict()
    .parse(result);
  if (parsed.status !== input.newStatus) {
    throw new Error("La respuesta del cambio de período no coincide.");
  }
  return parsed;
}

// ============================================================
// Plan de Cuentas — CRUD (server-side, bypasses Next.js proxy)
// ============================================================

import type {
  CreateCuentaInput,
  CuentaItem,
  UpdateCuentaInput,
} from "@/lib/accounting-client";

async function serviceGet<T>(path: string): Promise<T> {
  const { url, token } = getServiceConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/${path}`, {
      method: "GET",
      headers: { "X-Service-Token": token },
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw toServiceError(json, res.status);
    }
    return (json as { data: T }).data;
  } finally {
    clearTimeout(timer);
  }
}

async function servicePut<T>(path: string, body: unknown): Promise<T> {
  const { url, token } = getServiceConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/${path}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Token": token,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        (json as { error?: string }).error ??
          `Accounting service error: ${res.status}`
      );
    }
    return (json as { data: T }).data;
  } finally {
    clearTimeout(timer);
  }
}

async function servicePatch<T>(path: string, body: unknown): Promise<T> {
  const { url, token } = getServiceConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/${path}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Token": token,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        (json as { error?: string }).error ??
          `Accounting service error: ${res.status}`
      );
    }
    return (json as { data: T }).data;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchCuentaServer(
  id: string,
  orgId: string
): Promise<CuentaItem & { padre: CuentaItem | null }> {
  return serviceGet(`cuentas/${id}?org_id=${encodeURIComponent(orgId)}`);
}

export function createCuentaServer(
  input: CreateCuentaInput
): Promise<CuentaItem> {
  return servicePost("cuentas", input);
}

export function updateCuentaServer(
  id: string,
  input: UpdateCuentaInput
): Promise<CuentaItem> {
  return servicePut(`cuentas/${id}`, input);
}

export function toggleCuentaEstadoServer(
  id: string,
  activa: boolean
): Promise<CuentaItem> {
  return servicePatch(`cuentas/${id}/estado`, { activa });
}

// ============================================================
// Tesorería — wrappers server-to-service (bypasses Next.js proxy)
// ============================================================

import type {
  CreateBankAccountInput,
  CreateCashDepositSlipInput,
  CreateCheckDepositSlipInput,
  CreateIssuedCheckInput,
  CreateMovimientoBancarioInput,
  CreateReceivedCheckInput,
  EndorseReceivedChecksForPayableInput,
  EndorseReceivedChecksForPayableResult,
  IssuedCheck,
  ReceivedCheck,
  TreasuryBankAccount,
  TreasuryDepositSlip,
  TreasuryMovement,
  UpdateBankAccountInput,
} from "@/lib/accounting-client";

// ── Cuentas bancarias ─────────────────────────────────────────────────────────

export function fetchCuentasBancariasServer(
  orgId: string,
  soloActivas?: boolean
): Promise<TreasuryBankAccount[]> {
  const q = new URLSearchParams({ org_id: orgId });
  if (soloActivas) {
    q.set("solo_activas", "true");
  }
  return serviceGet(`tesoreria/cuentas-bancarias?${q}`);
}

export function createBankAccountServer(
  input: CreateBankAccountInput
): Promise<TreasuryBankAccount> {
  return servicePost("tesoreria/cuentas-bancarias", input);
}

export function updateBankAccountServer(
  id: string,
  orgId: string,
  input: UpdateBankAccountInput
): Promise<TreasuryBankAccount> {
  return servicePut(
    `tesoreria/cuentas-bancarias/${id}?org_id=${encodeURIComponent(orgId)}`,
    input
  );
}

export function toggleBankAccountEstadoServer(
  id: string,
  orgId: string,
  activa: boolean
): Promise<TreasuryBankAccount> {
  return servicePatch(
    `tesoreria/cuentas-bancarias/${id}/estado?org_id=${encodeURIComponent(orgId)}`,
    { activa }
  );
}

// ── Movimientos ───────────────────────────────────────────────────────────────

export function createMovimientoBancarioServer(
  input: CreateMovimientoBancarioInput
): Promise<TreasuryMovement> {
  return servicePost("tesoreria/movimientos-bancarios", input);
}

// ── Cheques recibidos ─────────────────────────────────────────────────────────

export function createChequeRecibidoServer(
  input: CreateReceivedCheckInput
): Promise<ReceivedCheck> {
  return servicePost("tesoreria/cheques/recibidos", input);
}

export function rechazarChequeRecibidoServer(
  id: string,
  orgId: string
): Promise<ReceivedCheck> {
  return servicePut(
    `tesoreria/cheques/recibidos/${id}/rechazar?org_id=${encodeURIComponent(orgId)}`,
    {}
  );
}

export function endorseReceivedChecksForPayableServer(
  input: EndorseReceivedChecksForPayableInput
): Promise<EndorseReceivedChecksForPayableResult> {
  return servicePost("tesoreria/cheques/recibidos/endosar-para-pago", input);
}

// ── Cheques emitidos ──────────────────────────────────────────────────────────

export function createChequeEmitidoServer(
  input: CreateIssuedCheckInput
): Promise<IssuedCheck> {
  return servicePost("tesoreria/cheques/emitidos", input);
}

export function debitarChequeEmitidoServer(
  id: string,
  orgId: string
): Promise<IssuedCheck> {
  return servicePut(
    `tesoreria/cheques/emitidos/${id}/debitar?org_id=${encodeURIComponent(orgId)}`,
    {}
  );
}

export function rechazarChequeEmitidoServer(
  id: string,
  orgId: string
): Promise<IssuedCheck> {
  return servicePut(
    `tesoreria/cheques/emitidos/${id}/rechazar?org_id=${encodeURIComponent(orgId)}`,
    {}
  );
}

// ── Boletas de depósito ───────────────────────────────────────────────────────

export function createBoletaDepositoChequesServer(
  input: CreateCheckDepositSlipInput
): Promise<TreasuryDepositSlip> {
  return servicePost("tesoreria/boletas/deposito-cheques", input);
}

export function createBoletaDepositoEfectivoServer(
  input: CreateCashDepositSlipInput
): Promise<TreasuryDepositSlip> {
  return servicePost("tesoreria/boletas/deposito-efectivo", input);
}
