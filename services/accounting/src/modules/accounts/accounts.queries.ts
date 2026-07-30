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

/**
 * Activa o desactiva una cuenta.
 * La validación de asientos activos / cuentas hijas vive en la capa de servicio.
 */
export function toggleCuentaEstado(
  id: string,
  activa: boolean
): Promise<ChartOfAccount | undefined> {
  return db
    .updateTable("accounting.chart_of_accounts")
    .set({ activa })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

/**
 * Retorna true si la cuenta tiene líneas de asiento ACTIVO —
 * en ese caso no es seguro desactivarla.
 */
export async function cuentaHasActiveEntries(id: string): Promise<boolean> {
  const row = await db
    .selectFrom("accounting.journal_entry_lines")
    .innerJoin(
      "accounting.journal_entries",
      "accounting.journal_entries.id",
      "accounting.journal_entry_lines.journal_entry_id"
    )
    .select(db.fn.count("accounting.journal_entry_lines.id").as("cnt"))
    .where("accounting.journal_entry_lines.cuenta_id", "=", id)
    .where("accounting.journal_entries.estado", "=", "ACTIVO")
    .executeTakeFirst();

  return Number(row?.cnt ?? 0) > 0;
}

/**
 * Retorna true si la cuenta tiene cuentas hijas activas.
 */
export async function cuentaHasActiveChildren(id: string): Promise<boolean> {
  const row = await db
    .selectFrom("accounting.chart_of_accounts")
    .select(db.fn.count<number>("id").as("cnt"))
    .where("padre_id", "=", id)
    .where("activa", "=", true)
    .executeTakeFirst();

  return Number(row?.cnt ?? 0) > 0;
}

/**
 * Devuelve el árbol jerárquico de cuentas para una organización.
 * Cada nodo raíz contiene un array `children` con sus cuentas hijas directas,
 * ordenadas por código dentro de cada nivel.
 */
export async function getCuentasArbol(
  orgId: string
): Promise<(ChartOfAccount & { children: ChartOfAccount[] })[]> {
  const all = await db
    .selectFrom("accounting.chart_of_accounts")
    .selectAll()
    .where("org_id", "=", orgId)
    .orderBy("codigo", "asc")
    .execute();

  type AccountWithChildren = ChartOfAccount & { children: ChartOfAccount[] };

  const nodeMap = new Map<string, AccountWithChildren>();
  for (const acc of all) {
    nodeMap.set(acc.id, { ...acc, children: [] });
  }

  const roots: AccountWithChildren[] = [];
  for (const node of nodeMap.values()) {
    if (node.padre_id && nodeMap.has(node.padre_id)) {
      // biome-ignore lint/style/noNonNullAssertion: checked with has()
      nodeMap.get(node.padre_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
