import { sql } from "kysely";
import { db } from "../../db/client";
import type {
  LibroExportFormat,
  MayorQuery,
} from "../../schemas/libros.schema";
import { AppError } from "../../utils/errors";
import { buildDelimitedFile, buildWorkbook } from "./excel.service";

export type MayorRow = {
  fecha: string;
  tipo_evento: string | null;
  descripcion: string | null;
  debe: string;
  haber: string;
  saldo_acumulado: string;
  journal_entry_id: string;
  linea_id: string;
};

export type MayorResult = {
  cuenta_id: string;
  cuenta_nombre: string;
  cuenta_codigo: string | null;
  saldo_inicial: string;
  rows: MayorRow[];
};

/**
 * Consulta el Libro Mayor para una cuenta específica en un período.
 * Incluye saldo acumulado via window function y saldo inicial antes del período.
 */
export async function queryMayor(
  cuentaId: string,
  params: MayorQuery
): Promise<MayorResult> {
  const { org_id, desde, hasta } = params;

  // Verify account exists and belongs to org
  const cuenta = await db
    .selectFrom("accounting.chart_of_accounts")
    .select(["id", "nombre", "account_code", "naturaleza"])
    .where("id", "=", cuentaId)
    .where("org_id", "=", org_id)
    .executeTakeFirst();

  if (!cuenta) {
    throw AppError.notFound(
      `Cuenta ${cuentaId} no encontrada para la organización`
    );
  }

  // Saldo inicial: sum of all movements BEFORE the period
  const saldoInicialResult = await sql<{ saldo: string }>`
    SELECT COALESCE(SUM(jel.debe - jel.haber), 0)::text AS saldo
    FROM accounting.journal_entry_lines jel
    INNER JOIN accounting.journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.cuenta_id = ${cuentaId}::uuid
      AND je.org_id = ${org_id}::uuid
      AND je.estado = 'ACTIVO'
      AND je.fecha < ${desde}::date
  `.execute(db);

  const saldo_inicial = saldoInicialResult.rows[0]?.saldo ?? "0";

  // Movements in period with running balance window function
  const rows = await sql<MayorRow>`
    SELECT
      je.fecha::text                                            AS fecha,
      je.tipo_evento,
      je.descripcion,
      jel.debe::text                                            AS debe,
      jel.haber::text                                           AS haber,
      (
        ${saldo_inicial}::numeric +
        SUM(jel.debe - jel.haber) OVER (
          PARTITION BY jel.cuenta_id
          ORDER BY je.fecha ASC, jel.id ASC
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )
      )::text                                                   AS saldo_acumulado,
      je.id                                                     AS journal_entry_id,
      jel.id                                                    AS linea_id
    FROM accounting.journal_entry_lines jel
    INNER JOIN accounting.journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.cuenta_id = ${cuentaId}::uuid
      AND je.org_id = ${org_id}::uuid
      AND je.estado = 'ACTIVO'
      AND je.fecha >= ${desde}::date
      AND je.fecha <= ${hasta}::date
    ORDER BY je.fecha ASC, jel.id ASC
  `.execute(db);

  return {
    cuenta_id: cuentaId,
    cuenta_nombre: cuenta.nombre,
    cuenta_codigo: cuenta.account_code,
    saldo_inicial,
    rows: rows.rows,
  };
}

const MAYOR_COLUMNS = [
  { header: "Fecha", key: "fecha", width: 12 },
  { header: "Tipo", key: "tipo_evento", width: 22 },
  { header: "Descripción", key: "descripcion", width: 35 },
  { header: "Debe", key: "debe", width: 14, numFmt: "#,##0.0000" },
  { header: "Haber", key: "haber", width: 14, numFmt: "#,##0.0000" },
  { header: "Saldo", key: "saldo_acumulado", width: 14, numFmt: "#,##0.0000" },
];

export async function exportMayorExcel(
  cuentaId: string,
  params: MayorQuery
): Promise<Buffer> {
  const result = await queryMayor(cuentaId, params);
  const sheetName = result.cuenta_nombre.slice(0, 31); // Excel max sheet name
  return buildWorkbook([
    { sheetName, columns: MAYOR_COLUMNS, rows: result.rows },
  ]);
}

export async function exportMayor(
  cuentaId: string,
  params: MayorQuery,
  format: Exclude<LibroExportFormat, "json" | "xlsx">
): Promise<Buffer> {
  const result = await queryMayor(cuentaId, params);
  return buildDelimitedFile(
    MAYOR_COLUMNS,
    result.rows,
    format === "csv" ? "," : "\t"
  );
}
