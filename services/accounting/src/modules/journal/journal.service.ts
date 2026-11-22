import { type Kysely, sql, type Transaction } from "kysely";
import { db } from "../../db/client";
import type { Database } from "../../db/types";
import { AppError } from "../../utils/errors";
import type {
  CreateJournalEntryInput,
  JournalEntryWithLines,
} from "./journal.types";

/**
 * Llama a la función PL/pgSQL create_journal_entry_transactional via sql raw.
 * La función maneja idempotencia, balance y estado_imputacion internamente.
 * Retorna el UUID del asiento creado (o existente si ya había sido procesado).
 */
export async function callCreateJournalEntry(
  input: CreateJournalEntryInput,
  executor: Kysely<Database> | Transaction<Database> = db
): Promise<string> {
  const lineasJson = JSON.stringify(
    input.lineas.map((l) => ({
      cuenta_id: l.cuentaId,
      debe: l.debe,
      haber: l.haber,
      descripcion: l.descripcion ?? null,
    }))
  );

  const result = await sql<{ create_journal_entry_transactional: string }>`
    SELECT accounting.create_journal_entry_transactional(
      ${input.orgId}::uuid,
      ${input.tipoEvento},
      ${input.referenciaId}::uuid,
      ${input.referenciaTabla},
      ${input.fecha}::date,
      ${input.descripcion},
      ${lineasJson}::jsonb,
      ${input.idempotencyKey},
      ${input.creadoPor ?? null}::uuid
    )
  `.execute(executor);

  const id = result.rows[0]?.create_journal_entry_transactional;
  if (!id) {
    throw new AppError("No se pudo crear el asiento contable", 500);
  }
  return id;
}

/**
 * Obtiene un asiento por ID junto con sus líneas.
 * Retorna undefined si no existe.
 */
export async function getJournalEntryById(
  id: string,
  orgId: string
): Promise<JournalEntryWithLines | undefined> {
  const entry = await db
    .selectFrom("accounting.journal_entries")
    .selectAll()
    .where("id", "=", id)
    .where("org_id", "=", orgId)
    .executeTakeFirst();

  if (!entry) {
    return;
  }

  const lineas = await db
    .selectFrom("accounting.journal_entry_lines")
    .selectAll()
    .where("journal_entry_id", "=", id)
    .execute();

  return { ...entry, lineas };
}

export async function findActiveJournalEntryIdByReference(params: {
  orgId: string;
  referenciaId: string;
  referenciaTabla: string;
  tipoEvento: string;
}): Promise<string | undefined> {
  const entry = await db
    .selectFrom("accounting.journal_entries")
    .select("id")
    .where("org_id", "=", params.orgId)
    .where("referencia_id", "=", params.referenciaId)
    .where("referencia_tabla", "=", params.referenciaTabla)
    .where("tipo_evento", "=", params.tipoEvento)
    .where("estado", "=", "ACTIVO")
    .orderBy("creado_at", "desc")
    .executeTakeFirst();

  return entry?.id;
}

type JournalOrigin = {
  orgId: string;
  referenciaId: string;
  referenciaTabla: "sales_orders" | "credit_notes" | "mercadolibre_payments";
};

export function buildJournalEntriesByOriginQuery(
  params: JournalOrigin,
  executor: Kysely<Database> = db
) {
  const originals = executor
    .selectFrom("accounting.journal_entries")
    .select("id")
    .where("org_id", "=", params.orgId)
    .where("referencia_id", "=", params.referenciaId)
    .where("referencia_tabla", "=", params.referenciaTabla);

  return executor
    .selectFrom("accounting.journal_entries")
    .select([
      "id",
      "org_id",
      "tipo_evento",
      "referencia_id",
      "referencia_tabla",
      "estado",
      "idempotency_key",
      "anulado_por_id",
      "fecha",
    ])
    .where("org_id", "=", params.orgId)
    .where((expression) =>
      expression.or([
        expression.and([
          expression("referencia_id", "=", params.referenciaId),
          expression("referencia_tabla", "=", params.referenciaTabla),
        ]),
        expression.and([
          expression("tipo_evento", "=", "CONTRA_ASIENTO"),
          expression("referencia_tabla", "=", "accounting.journal_entries"),
          expression("referencia_id", "in", originals),
        ]),
      ])
    )
    .orderBy("creado_at", "asc")
    .orderBy("id", "asc");
}

export function listJournalEntriesByOrigin(params: JournalOrigin) {
  return buildJournalEntriesByOriginQuery(params).execute();
}
