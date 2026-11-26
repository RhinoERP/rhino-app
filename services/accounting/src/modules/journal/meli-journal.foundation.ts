import { type Kysely, sql, type Transaction } from "kysely";
import { z } from "zod";
import type { Database } from "../../db/types";
import { AppError } from "../../utils/errors";

const money = z.string().regex(/^(0|[1-9]\d{0,10})(?:\.\d{1,2})?$/);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Fecha inválida");

export const meliJournalInput = z
  .object({
    orgId: z.string().uuid(),
    originType: z.enum(["invoice", "creditNote", "payment"]),
    originId: z.string().uuid(),
    componentKey: z.string().min(1).max(200),
    requestKey: z.string().uuid(),
    date,
    description: z.string().min(1).max(2000),
    actorId: z.string().uuid(),
    currency: z.enum(["ARS", "USD"]),
    exchangeRate: z.string().regex(/^(0|[1-9]\d{0,5})(?:\.\d{1,4})?$/),
    lines: z
      .array(
        z
          .object({
            accountId: z.string().uuid(),
            side: z.enum(["DEBE", "HABER"]),
            originalAmount: money,
            pesosAmount: money,
          })
          .strict()
      )
      .min(2)
      .max(200),
  })
  .strict();

export type MeliJournalFoundationInput = z.infer<typeof meliJournalInput>;
type Executor = Kysely<Database> | Transaction<Database>;

export const meliReversalInput = z
  .object({
    orgId: z.string().uuid(),
    originalEntryId: z.string().uuid(),
    requestKey: z.string().uuid(),
    date,
    description: z
      .string()
      .min(1)
      .max(2000)
      .refine((value) => value.trim().length > 0),
    actorId: z.string().uuid(),
  })
  .strict();

export type MeliReversalFoundationInput = z.input<typeof meliReversalInput>;

export const meliReversalSourceInput = z
  .object({
    original: meliJournalInput.refine(
      (value) => value.originType === "payment"
    ),
    reversal: meliReversalInput,
  })
  .strict()
  .refine(
    ({ original, reversal }) =>
      original.orgId.toLowerCase() === reversal.orgId.toLowerCase(),
    "Las organizaciones del original y la reversión no coinciden"
  );

function reversalSourceArguments(
  original: z.output<typeof meliJournalInput>,
  reversal: z.output<typeof meliReversalInput>
) {
  return sql`
    ${original.orgId}::uuid, ${reversal.originalEntryId}::uuid,
    ${original.requestKey}::uuid,
    jsonb_build_object(
      'orgId', ${original.orgId}::uuid, 'originType', ${original.originType}::text,
      'originId', ${original.originId}::uuid, 'componentKey', ${original.componentKey}::text,
      'date', ${original.date}::date, 'description', ${original.description}::text,
      'actorId', ${original.actorId}::uuid, 'currency', ${original.currency}::text,
      'exchangeRate', ${original.exchangeRate}::numeric, 'lines', ${JSON.stringify(original.lines)}::jsonb
    ),
    ${reversal.requestKey}::uuid, ${reversal.date}::date,
    ${reversal.description}::text, ${reversal.actorId}::uuid
  `;
}

export async function verifyMeliReversalSourceFoundation(
  rawInput: z.input<typeof meliReversalSourceInput>,
  executor: Executor
) {
  const { original, reversal } = meliReversalSourceInput.parse(rawInput);
  const result = await sql<{
    original_entry_id: string;
    reversal_entry_id: string | null;
  }>`
    SELECT original_entry_id, reversal_entry_id
    FROM accounting.verify_meli_payment_reversal_source(
      ${reversalSourceArguments(original, reversal)}
    )
  `.execute(executor);
  const row = z
    .object({
      original_entry_id: z.string().uuid(),
      reversal_entry_id: z.string().uuid().nullable(),
    })
    .parse(result.rows[0]);
  if (
    row.original_entry_id.toLowerCase() !==
    reversal.originalEntryId.toLowerCase()
  ) {
    throw new AppError(
      "El original recuperado no coincide con la reserva.",
      409
    );
  }
  return {
    originalEntryId: row.original_entry_id,
    reversalEntryId: row.reversal_entry_id,
  };
}

export async function reverseVerifiedMeliPaymentFoundation(
  rawInput: z.input<typeof meliReversalSourceInput>,
  executor: Executor
): Promise<string> {
  const { original, reversal } = meliReversalSourceInput.parse(rawInput);
  const result = await sql<{ reversal_entry_id: string }>`
    SELECT accounting.reverse_verified_meli_payment(
      ${reversalSourceArguments(original, reversal)}
    ) AS reversal_entry_id
  `.execute(executor);
  const entryId = z.string().uuid().parse(result.rows[0]?.reversal_entry_id);
  if (entryId.toLowerCase() === reversal.originalEntryId.toLowerCase()) {
    throw new AppError("El contra-asiento coincide con su original.", 409);
  }
  return entryId;
}

function requestParameters(rawInput: MeliJournalFoundationInput) {
  const input = meliJournalInput.parse(rawInput);
  return { input, lines: JSON.stringify(input.lines) };
}

/**
 * Internal primitive only. The caller must enforce source, permissions, period,
 * antecedent and reconciliation checks before using this function.
 */
export async function createMeliJournalFoundation(
  rawInput: MeliJournalFoundationInput,
  executor: Executor
): Promise<string> {
  const { input, lines } = requestParameters(rawInput);
  const result = await sql<{ id: string }>`
    SELECT accounting.create_meli_journal_entry(
      ${input.orgId}::uuid, ${input.originType}::text, ${input.originId}::uuid,
      ${input.componentKey}::text, ${input.requestKey}::uuid, ${input.date}::date,
      ${input.description}::text, ${input.actorId}::uuid, ${input.currency}::text,
      ${input.exchangeRate}::numeric, ${lines}::jsonb
    ) AS id
  `.execute(executor);
  const id = result.rows[0]?.id;
  if (!id) {
    throw new AppError("No se recibió el identificador del asiento Meli", 500);
  }
  return id;
}

/**
 * An absent result does not prove a request is no longer in flight. Any retry
 * must retain the original request key and payload.
 */
export async function findMeliJournalFoundation(
  rawInput: MeliJournalFoundationInput,
  executor: Executor
): Promise<string | undefined> {
  const { input, lines } = requestParameters(rawInput);
  const result = await sql<{
    journal_entry_id: string;
    has_reversal: boolean;
  }>`
    SELECT verified.journal_entry_id,
      (original.anulado_por_id IS NOT NULL OR EXISTS (
        SELECT 1 FROM accounting.journal_entries reversal
        WHERE reversal.org_id = original.org_id
          AND reversal.tipo_evento = 'CONTRA_ASIENTO'
          AND reversal.referencia_tabla = 'accounting.journal_entries'
          AND reversal.referencia_id = original.id
      )) AS has_reversal
    FROM accounting.find_meli_journal_request(
      ${input.orgId}::uuid, ${input.requestKey}::uuid,
      jsonb_build_object(
        'orgId', ${input.orgId}::uuid, 'originType', ${input.originType}::text,
        'originId', ${input.originId}::uuid, 'componentKey', ${input.componentKey}::text,
        'date', ${input.date}::date, 'description', ${input.description}::text,
        'actorId', ${input.actorId}::uuid, 'currency', ${input.currency}::text,
        'exchangeRate', ${input.exchangeRate}::numeric, 'lines', ${lines}::jsonb
      )
    ) verified
    JOIN accounting.journal_entries original ON original.id = verified.journal_entry_id
  `.execute(executor);
  const receipt = result.rows[0];
  if (receipt && receipt.has_reversal !== false) {
    throw new AppError(
      "El asiento Meli recuperado tiene una reversión o no es verificable.",
      409
    );
  }
  return receipt?.journal_entry_id;
}

export async function inspectMeliInvoiceFoundation(
  orgId: string,
  saleId: string,
  executor: Executor
) {
  const input = z
    .object({ orgId: z.string().uuid(), saleId: z.string().uuid() })
    .parse({
      orgId,
      saleId,
    });
  const result = await sql<{
    journal_entry_id: string;
    request_key: string;
    payload: unknown;
    has_reversal: boolean;
  }>`
    SELECT r.journal_entry_id, r.request_key, r.payload,
      (EXISTS (SELECT 1 FROM accounting.journal_entries original
        WHERE original.id = r.journal_entry_id AND original.org_id = r.org_id
          AND original.anulado_por_id IS NOT NULL
      ) OR EXISTS (SELECT 1 FROM accounting.journal_entries e
        WHERE e.org_id = r.org_id AND e.tipo_evento = 'CONTRA_ASIENTO'
          AND e.referencia_tabla = 'accounting.journal_entries'
          AND e.referencia_id = r.journal_entry_id AND e.estado = 'ACTIVO'
      )) AS has_reversal
    FROM accounting.meli_journal_requests r
    CROSS JOIN LATERAL accounting.find_meli_journal_request(
      r.org_id, r.request_key, r.payload
    ) verified
    WHERE r.org_id = ${input.orgId}::uuid
      AND r.origin_type = 'invoice' AND r.origin_id = ${input.saleId}::uuid
      AND r.component_key = 'fiscal'
      AND verified.journal_entry_id = r.journal_entry_id
    LIMIT 2
  `.execute(executor);
  if (result.rows.length > 1) {
    throw new AppError(
      "La factura tiene múltiples solicitudes contables; requiere revisión.",
      409
    );
  }
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  if (row.has_reversal !== false) {
    throw new AppError(
      "El asiento de factura tiene una reversión o no es verificable.",
      409
    );
  }
  const persisted = z
    .object({ exchangeRate: z.number().finite() })
    .passthrough()
    .parse(row.payload);
  const payload = meliJournalInput.parse({
    ...persisted,
    exchangeRate: String(persisted.exchangeRate),
    requestKey: row.request_key,
  });
  if (
    payload.orgId.toLowerCase() !== input.orgId.toLowerCase() ||
    payload.originId.toLowerCase() !== input.saleId.toLowerCase() ||
    payload.originType !== "invoice" ||
    payload.componentKey !== "fiscal"
  ) {
    throw new AppError("El recibo contable no coincide con la factura.", 409);
  }
  return {
    journalEntryId: z.string().uuid().parse(row.journal_entry_id),
    payload,
  };
}

/**
 * Requires a durable request key and payload before calling. This only connects
 * the accounting primitives; it does not authorize or confirm an app dispatch.
 */
async function createAndVerify(
  create: () => Promise<string>,
  find: () => Promise<string | undefined>,
  label: string
): Promise<string> {
  let createdId: string | undefined;
  let creationError: unknown;
  try {
    createdId = await create();
  } catch (error) {
    creationError = error;
  }

  let verifiedId: string | undefined;
  try {
    verifiedId = await find();
  } catch (error) {
    throw new AggregateError(
      creationError === undefined ? [error] : [creationError, error],
      `No se pudo verificar ${label}; conservá la misma clave y payload.`
    );
  }

  if (!verifiedId) {
    throw new AggregateError(
      creationError === undefined ? [] : [creationError],
      `No se pudo confirmar ${label}; conservá la misma clave y payload.`
    );
  }
  if (createdId && createdId !== verifiedId) {
    throw new AppError(
      `El identificador de ${label} no coincide con su recuperación.`,
      500
    );
  }
  return verifiedId;
}

export async function createAndVerifyMeliJournalFoundation(
  input: MeliJournalFoundationInput,
  executor: Executor
): Promise<string> {
  const parsedInput = meliJournalInput.parse(input);
  return await createAndVerify(
    () => createMeliJournalFoundation(parsedInput, executor),
    () => findMeliJournalFoundation(parsedInput, executor),
    "el asiento Meli"
  );
}

export async function reverseMeliPaymentFoundation(
  rawInput: MeliReversalFoundationInput,
  executor: Executor
): Promise<string> {
  const input = meliReversalInput.parse(rawInput);
  const result = await sql<{ id: string }>`
    SELECT accounting.reverse_meli_payment_entry(
      ${input.orgId}::uuid, ${input.originalEntryId}::uuid,
      ${input.requestKey}::uuid, ${input.date}::date,
      ${input.description}::text, ${input.actorId}::uuid
    ) AS id
  `.execute(executor);
  const id = result.rows[0]?.id;
  if (!id) {
    throw new AppError(
      "No se recibió el identificador de la reversión Meli",
      500
    );
  }
  return id;
}

export async function findMeliPaymentReversalFoundation(
  rawInput: MeliReversalFoundationInput,
  executor: Executor
): Promise<string | undefined> {
  const input = meliReversalInput.parse(rawInput);
  const result = await sql<{ reversal_entry_id: string }>`
    SELECT reversal_entry_id FROM accounting.find_meli_payment_reversal(
      ${input.orgId}::uuid, ${input.originalEntryId}::uuid,
      ${input.requestKey}::uuid, ${input.date}::date,
      ${input.description}::text, ${input.actorId}::uuid
    )
  `.execute(executor);
  return result.rows[0]?.reversal_entry_id;
}

export async function reverseAndVerifyMeliPaymentFoundation(
  input: MeliReversalFoundationInput,
  executor: Executor
): Promise<string> {
  const parsedInput = meliReversalInput.parse(input);
  return await createAndVerify(
    () => reverseMeliPaymentFoundation(parsedInput, executor),
    () => findMeliPaymentReversalFoundation(parsedInput, executor),
    "la reversión Meli"
  );
}
