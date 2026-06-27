import { sql } from "kysely";
import { db } from "../../db/client";
import type {
  DiarioQuery,
  LibroExportFormat,
} from "../../schemas/libros.schema";
import { buildDelimitedFile, buildWorkbook } from "./excel.service";

export type DiarioRow = {
  numero: number;
  fecha: string;
  tipo_evento: string | null;
  descripcion: string | null;
  cuenta_nombre: string | null;
  cuenta_codigo: string | null;
  debe: string;
  haber: string;
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
        CASE
          WHEN je.tipo_evento = 'FACTURA_COMPRA' AND je.referencia_tabla = 'purchase_orders' THEN
            'Factura compra ' || COALESCE(
              NULLIF(po.remittance_number, ''),
              CASE
                WHEN po.purchase_number IS NOT NULL THEN po.purchase_number::text
                ELSE NULL
              END,
              'sin comprobante'
            )
          ELSE je.descripcion
        END                                                               AS descripcion,
        coa.nombre                                                        AS cuenta_nombre,
        coa.account_code                                                  AS cuenta_codigo,
        jel.debe::text,
        jel.haber::text,
        je.id                                                             AS journal_entry_id,
        jel.id                                                            AS linea_id
      FROM accounting.journal_entries je
      INNER JOIN accounting.journal_entry_lines jel ON jel.journal_entry_id = je.id
      LEFT  JOIN accounting.chart_of_accounts   coa ON coa.id = jel.cuenta_id
      LEFT  JOIN public.purchase_orders         po  ON po.id::text = je.referencia_id::text
      WHERE je.org_id = ${org_id}::uuid
        AND je.estado  = 'ACTIVO'
        AND je.fecha  >= ${desde}::date
        AND je.fecha  <= ${hasta}::date
        ${cuentaFilter}
        ${tipoFilter}
      ORDER BY je.fecha DESC, je.numero DESC, jel.id ASC
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
  { header: "Cuenta", key: "cuenta_nombre", width: 35 },
  { header: "Debe", key: "debe", width: 14, numFmt: "#,##0.0000" },
  { header: "Haber", key: "haber", width: 14, numFmt: "#,##0.0000" },
];

export async function exportDiarioExcel(params: DiarioQuery): Promise<Buffer> {
  const all = await queryDiario({ ...params, page: 1, page_size: 5000 });
  return buildWorkbook([
    { sheetName: "Libro Diario", columns: DIARIO_COLUMNS, rows: all.rows },
  ]);
}

export async function exportDiario(
  params: DiarioQuery,
  format: Exclude<LibroExportFormat, "json" | "xlsx">
): Promise<Buffer> {
  const all = await queryDiario({ ...params, page: 1, page_size: 5000 });
  return buildDelimitedFile(
    DIARIO_COLUMNS,
    all.rows,
    format === "csv" ? "," : "\t"
  );
}
