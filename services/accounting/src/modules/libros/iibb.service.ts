import { sql } from "kysely";
import { db } from "../../db/client";
import type { LibroQuery } from "../../schemas/libros.schema";
import { buildWorkbook } from "./excel.service";

// Account codes for IIBB — must match the seed
const IIBB_ACCOUNT_CODES = [
  "PERCEPCIONES_IIBB",
  "RETENCIONES_IIBB",
  "IIBB_GASTO",
];

export type IIBBRow = {
  fecha: string;
  tipo_evento: string | null;
  descripcion: string | null;
  cuenta_nombre: string | null;
  cuenta_codigo: string | null;
  base_imponible: string;
  iibb: string;
  journal_entry_id: string;
};

export type IIBBResult = {
  rows: IIBBRow[];
};

/**
 * Consulta el Libro IIBB: filtra líneas cuya cuenta tiene account_code de IIBB.
 * Agrupa por asiento mostrando base imponible (deducida del asiento) e importe IIBB.
 */
export async function queryLibroIIBB(params: LibroQuery): Promise<IIBBResult> {
  const { org_id, desde, hasta } = params;

  const rows = await sql<IIBBRow>`
    WITH iibb_lines AS (
      SELECT
        je.id                   AS journal_entry_id,
        je.fecha,
        je.tipo_evento,
        je.descripcion,
        je.referencia_tabla,
        je.referencia_id,
        coa.nombre              AS cuenta_nombre,
        coa.account_code        AS cuenta_codigo,
        jel.debe + jel.haber    AS monto_iibb
      FROM accounting.journal_entry_lines jel
      INNER JOIN accounting.journal_entries je ON je.id = jel.journal_entry_id
      INNER JOIN accounting.chart_of_accounts coa ON coa.id = jel.cuenta_id
      WHERE je.org_id = ${org_id}::uuid
        AND je.estado = 'ACTIVO'
        AND je.fecha >= ${desde}::date
        AND je.fecha <= ${hasta}::date
        AND coa.account_code = ANY(${IIBB_ACCOUNT_CODES}::text[])
    ),
    -- Base imponible: total del asiento menos el importe IIBB (aproximación para Fase 1)
    totales AS (
      SELECT
        jel.journal_entry_id,
        SUM(jel.debe) AS total_debe
      FROM accounting.journal_entry_lines jel
      GROUP BY jel.journal_entry_id
    )
    SELECT
      il.fecha::text                        AS fecha,
      il.tipo_evento,
      il.descripcion,
      il.cuenta_nombre,
      il.cuenta_codigo,
      (t.total_debe - il.monto_iibb)::text  AS base_imponible,
      il.monto_iibb::text                   AS iibb,
      il.journal_entry_id
    FROM iibb_lines il
    LEFT JOIN totales t ON t.journal_entry_id = il.journal_entry_id
    ORDER BY il.fecha ASC, il.journal_entry_id ASC
  `.execute(db);

  return { rows: rows.rows };
}

const IIBB_COLUMNS = [
  { header: "Fecha", key: "fecha", width: 12 },
  { header: "Tipo", key: "tipo_evento", width: 22 },
  { header: "Descripción", key: "descripcion", width: 35 },
  { header: "Cuenta", key: "cuenta_nombre", width: 30 },
  {
    header: "Base Imponible",
    key: "base_imponible",
    width: 16,
    numFmt: "#,##0.0000",
  },
  { header: "IIBB", key: "iibb", width: 14, numFmt: "#,##0.0000" },
];

export async function exportIIBBExcel(params: LibroQuery): Promise<Buffer> {
  const result = await queryLibroIIBB(params);
  return buildWorkbook([
    { sheetName: "Libro IIBB", columns: IIBB_COLUMNS, rows: result.rows },
  ]);
}
