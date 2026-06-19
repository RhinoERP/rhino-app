import { sql } from "kysely";
import { db } from "../../db/client";
import type { DiarioQuery } from "../../schemas/libros.schema";
import { buildWorkbook } from "./excel.service";

export type DiarioRow = {
  numero: number;
  fecha: string;
  tipo_evento: string | null;
  descripcion: string | null;
  referencia: string | null;
  cuenta_nombre: string | null;
  cuenta_codigo: string | null;
  debe: string;
  haber: string;
  estado_imputacion: string;
  journal_entry_id: string;
  linea_id: string;
};

export type DiarioResult = {
  rows: DiarioRow[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * Consulta paginada del Libro Diario via raw SQL para evitar limitaciones de
 * Kysely con table aliases en WHERE clauses.
 */
export async function queryDiario(params: DiarioQuery): Promise<DiarioResult> {
  const { org_id, desde, hasta, page, page_size, cuenta_id, tipo_evento } =
    params;
  const offset = (page - 1) * page_size;

  const cuentaFilter = cuenta_id
    ? sql` AND jel.cuenta_id = ${cuenta_id}::uuid`
    : sql``;
  const tipoFilter = tipo_evento
    ? sql` AND je.tipo_evento = ${tipo_evento}`
    : sql``;

  const [rowsResult, countResult] = await Promise.all([
    sql<DiarioRow>`
      SELECT
        je.numero::int                                                    AS numero,
        je.fecha::text                                                    AS fecha,
        je.tipo_evento,
        je.descripcion,
        CASE WHEN je.referencia_tabla IS NOT NULL AND je.referencia_id IS NOT NULL
          THEN je.referencia_tabla || ' ' || LEFT(je.referencia_id::text, 8)
          ELSE NULL END                                                   AS referencia,
        coa.nombre                                                        AS cuenta_nombre,
        coa.account_code                                                  AS cuenta_codigo,
        jel.debe::text,
        jel.haber::text,
        je.estado_imputacion,
        je.id                                                             AS journal_entry_id,
        jel.id                                                            AS linea_id
      FROM accounting.journal_entries je
      INNER JOIN accounting.journal_entry_lines jel ON jel.journal_entry_id = je.id
      LEFT  JOIN accounting.chart_of_accounts   coa ON coa.id = jel.cuenta_id
      WHERE je.org_id = ${org_id}::uuid
        AND je.estado  = 'ACTIVO'
        AND je.fecha  >= ${desde}::date
        AND je.fecha  <= ${hasta}::date
        ${cuentaFilter}
        ${tipoFilter}
      ORDER BY je.fecha ASC, je.numero ASC, jel.id ASC
      LIMIT ${page_size} OFFSET ${offset}
    `.execute(db),
    sql<{ count: string }>`
      SELECT COUNT(*)::text AS count
      FROM accounting.journal_entries je
      INNER JOIN accounting.journal_entry_lines jel ON jel.journal_entry_id = je.id
      WHERE je.org_id = ${org_id}::uuid
        AND je.estado  = 'ACTIVO'
        AND je.fecha  >= ${desde}::date
        AND je.fecha  <= ${hasta}::date
        ${cuentaFilter}
        ${tipoFilter}
    `.execute(db),
  ]);

  return {
    rows: rowsResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
    page,
    pageSize: page_size,
  };
}

const DIARIO_COLUMNS = [
  { header: "Número", key: "numero", width: 10 },
  { header: "Fecha", key: "fecha", width: 12 },
  { header: "Tipo", key: "tipo_evento", width: 22 },
  { header: "Descripción", key: "descripcion", width: 35 },
  { header: "Referencia", key: "referencia", width: 20 },
  { header: "Cuenta", key: "cuenta_nombre", width: 35 },
  { header: "Debe", key: "debe", width: 14, numFmt: "#,##0.0000" },
  { header: "Haber", key: "haber", width: 14, numFmt: "#,##0.0000" },
  { header: "Estado", key: "estado_imputacion", width: 12 },
];

export async function exportDiarioExcel(params: DiarioQuery): Promise<Buffer> {
  const all = await queryDiario({ ...params, page: 1, page_size: 5000 });
  return buildWorkbook([
    { sheetName: "Libro Diario", columns: DIARIO_COLUMNS, rows: all.rows },
  ]);
}
