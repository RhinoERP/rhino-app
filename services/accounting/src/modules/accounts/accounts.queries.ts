import { db } from "../../db/client";
import type {
  ChartOfAccount,
  NewChartOfAccount,
  UpdateChartOfAccount,
} from "../../db/types";

/**
 * Resuelve un account_code semántico (ej: "AR_CLIENTES") al UUID de la cuenta.
 * Retorna null si el account_code no existe o no está activo.
 */
export async function resolveAccountCode(
  accountCode: string,
  orgId: string
): Promise<string | null> {
  const row = await db
    .selectFrom("accounting.chart_of_accounts")
    .select("id")
    .where("account_code", "=", accountCode)
    .where("org_id", "=", orgId)
    .where("activa", "=", true)
    .executeTakeFirst();

  return row?.id ?? null;
}

/**
 * Resuelve un account_code semántico al UUID + codigo interno (ej: "1.1.01").
 * Retorna null si no existe o no está activo.
 */
export async function resolveAccountFull(
  accountCode: string,
  orgId: string
): Promise<{ id: string; codigo: string; nombre: string } | null> {
  const row = await db
    .selectFrom("accounting.chart_of_accounts")
    .select(["id", "codigo", "nombre"])
    .where("account_code", "=", accountCode)
    .where("org_id", "=", orgId)
    .where("activa", "=", true)
    .executeTakeFirst();

  return row ?? null;
}

/**
 * Lista cuentas del plan de cuentas de una organización.
 */
export function listCuentas(
  orgId: string,
  soloActivas = true
): Promise<ChartOfAccount[]> {
  let query = db
    .selectFrom("accounting.chart_of_accounts")
    .selectAll()
    .where("org_id", "=", orgId)
    .orderBy("codigo", "asc");

  if (soloActivas) {
    query = query.where("activa", "=", true);
  }

  return query.execute();
}

/**
 * Obtiene una cuenta por ID.
 */
export function getCuentaById(id: string): Promise<ChartOfAccount | undefined> {
  return db
    .selectFrom("accounting.chart_of_accounts")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
}

/**
 * Crea una cuenta en el plan de cuentas.
 */
export async function createCuenta(
  input: NewChartOfAccount
): Promise<ChartOfAccount> {
  const row = await db
    .insertInto("accounting.chart_of_accounts")
    .values(input)
    .returningAll()
    .executeTakeFirstOrThrow();

  return row;
}

/**
 * Actualiza una cuenta existente.
 */
export function updateCuenta(
  id: string,
  input: UpdateChartOfAccount
): Promise<ChartOfAccount | undefined> {
  return db
    .updateTable("accounting.chart_of_accounts")
    .set(input)
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}
