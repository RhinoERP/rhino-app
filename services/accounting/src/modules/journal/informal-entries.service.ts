import { sql } from "kysely";
import { db } from "../../db/client";
import type { InformalEntry, InformalEntryLine } from "../../db/types";
import { AppError } from "../../utils/errors";
import { callCreateJournalEntry } from "./journal.service";
import type { CreateJournalEntryInput } from "./journal.types";

export type InformalEntryWithLines = InformalEntry & {
  lineas: InformalEntryLine[];
};

export type CreateInformalEntryInput = CreateJournalEntryInput & {
  sourceType: "NOTA_DE_VENTA" | "FACTURA_PENDIENTE";
};

export type InformalEntryFilters = {
  orgId: string;
  estadoFormalizacion?: "PENDIENTE" | "FORMALIZADO" | "CANCELADO";
  sourceType?: "NOTA_DE_VENTA" | "FACTURA_PENDIENTE";
  desde?: string;
  hasta?: string;
};

/**
 * Crea un asiento informal via PL/pgSQL.
 * Retorna el UUID del asiento creado (o existente si ya fue procesado).
 */
export async function callCreateInformalEntry(
  input: CreateInformalEntryInput
): Promise<string> {
  const lineasJson = JSON.stringify(
    input.lineas.map((l) => ({
      cuenta_id: l.cuentaId ?? null,
      debe: l.debe,
      haber: l.haber,
      descripcion: l.descripcion ?? null,
      pendiente_imputacion: l.pendienteImputacion,
    }))
  );

  const result = await sql<{ create_informal_entry_transactional: string }>`
    SELECT accounting.create_informal_entry_transactional(
      ${input.orgId}::uuid,
      ${input.tipoEvento},
      ${input.referenciaId}::uuid,
      ${input.referenciaTabla},
      ${input.fecha}::date,
      ${input.descripcion},
      ${lineasJson}::jsonb,
      ${input.idempotencyKey},
      ${input.sourceType},
      ${input.creadoPor ?? null}::uuid
    )
  `.execute(db);

  const id = result.rows[0]?.create_informal_entry_transactional;
  if (!id) {
    throw new AppError("No se pudo crear el asiento informal", 500);
  }
  return id;
}

/**
 * Formaliza un asiento informal: copia sus líneas a journal_entries
 * y marca el informal entry como FORMALIZADO.
 * Idempotente: si ya está formalizado retorna el journal entry existente.
 */
export async function formalizarInformalEntry(
  informalEntryId: string
): Promise<string> {
  const entry = await db
    .selectFrom("accounting.informal_entries")
    .selectAll()
    .where("id", "=", informalEntryId)
    .executeTakeFirst();

  if (!entry) {
    throw new AppError("Asiento informal no encontrado", 404);
  }

  if (entry.estado_formalizacion === "FORMALIZADO") {
    const existingId = entry.formalized_journal_entry_id;
    if (!existingId) {
      throw new AppError(
        "El asiento informal está formalizado pero sin referencia al asiento formal",
        500
      );
    }
    return existingId;
  }

  if (entry.estado_formalizacion === "CANCELADO") {
    throw new AppError("No se puede formalizar un asiento cancelado", 422);
  }

  const lineas = await db
    .selectFrom("accounting.informal_entry_lines")
    .selectAll()
    .where("informal_entry_id", "=", informalEntryId)
    .execute();

  const journalInput: CreateJournalEntryInput = {
    orgId: entry.org_id,
    tipoEvento: entry.tipo_evento ?? "FACTURA_VENTA",
    referenciaId: entry.referencia_id ?? entry.id,
    referenciaTabla: entry.referencia_tabla ?? "informal_entries",
    fecha:
      entry.fecha instanceof Date
        ? entry.fecha.toISOString().slice(0, 10)
        : String(entry.fecha),
    descripcion: entry.descripcion ?? "",
    idempotencyKey: `FORMAL_${entry.idempotency_key}`,
    creadoPor: entry.creado_por ?? undefined,
    lineas: lineas.map((l) => ({
      cuentaId: l.cuenta_id,
      debe: String(l.debe),
      haber: String(l.haber),
      descripcion: l.descripcion ?? undefined,
      pendienteImputacion: l.pendiente_imputacion,
    })),
  };

  const journalEntryId = await callCreateJournalEntry(journalInput);

  await db
    .updateTable("accounting.informal_entries")
    .set({
      estado_formalizacion: "FORMALIZADO",
      formalized_journal_entry_id: journalEntryId,
    })
    .where("id", "=", informalEntryId)
    .execute();

  return journalEntryId;
}

/**
 * Lista asientos informales con filtros opcionales.
 */
export async function listInformalEntries(
  filters: InformalEntryFilters
): Promise<InformalEntry[]> {
  let query = db
    .selectFrom("accounting.informal_entries")
    .selectAll()
    .where("org_id", "=", filters.orgId);

  if (filters.estadoFormalizacion) {
    query = query.where(
      "estado_formalizacion",
      "=",
      filters.estadoFormalizacion
    );
  }

  if (filters.sourceType) {
    query = query.where("source_type", "=", filters.sourceType);
  }

  if (filters.desde) {
    query = query.where("fecha", ">=", filters.desde as unknown as Date);
  }

  if (filters.hasta) {
    query = query.where("fecha", "<=", filters.hasta as unknown as Date);
  }

  return await query.orderBy("creado_at", "desc").execute();
}

/**
 * Obtiene un asiento informal por ID junto con sus líneas.
 */
export async function getInformalEntryById(
  id: string
): Promise<InformalEntryWithLines | undefined> {
  const entry = await db
    .selectFrom("accounting.informal_entries")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!entry) {
    return;
  }

  const lineas = await db
    .selectFrom("accounting.informal_entry_lines")
    .selectAll()
    .where("informal_entry_id", "=", id)
    .execute();

  return { ...entry, lineas };
}
