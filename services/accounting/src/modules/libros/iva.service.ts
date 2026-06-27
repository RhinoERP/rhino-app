import { sql } from "kysely";
import { db } from "../../db/client";
import type { IVAQuery, LibroExportFormat } from "../../schemas/libros.schema";
import { buildDelimitedFile, buildWorkbook } from "./excel.service";

// Account codes used for IVA filtering — must match the seed
const IVA_ACCOUNT_CODES = {
  debito: "IVA_DEBITO_FISCAL",
  credito: "IVA_CREDITO_FISCAL",
  ventas: [
    "VENTAS_CALZADO",
    "VENTAS_INDUMENTARIA",
    "VENTAS_MERCHANDISING",
    "VENTAS_PREVENCION",
    "VENTAS_PROTECCION",
    "VENTAS_SEGURIDAD",
    "OTROS_INGRESOS",
  ],
  compras: ["AP_PROVEEDORES"],
};

export type IVARow = {
  fecha: string;
  tipo_evento: string | null;
  referencia: string | null;
  neto_gravado: string;
  iva: string;
  total: string;
  journal_entry_id: string;
};

export type IVAResult = {
  tipo: "ventas" | "compras";
  rows: IVARow[];
};

/**
 * Consulta el Libro IVA (ventas o compras) para un período.
 * Agrupa por asiento: columna neto + columna IVA + total.
 */
export async function queryLibroIVA(params: IVAQuery): Promise<IVAResult> {
  const { org_id, desde, hasta, tipo } = params;

  const ivaCuentaCodigo =
    tipo === "ventas" ? IVA_ACCOUNT_CODES.debito : IVA_ACCOUNT_CODES.credito;
  const eventoTipo =
    tipo === "ventas"
      ? ["FACTURA_VENTA", "NC_VENTA"]
      : ["FACTURA_COMPRA", "NC_COMPRA"];

  const rows = await sql<IVARow>`
    WITH asientos AS (
      SELECT DISTINCT je.id, je.fecha, je.tipo_evento, je.descripcion,
        je.referencia_tabla, je.referencia_id
      FROM accounting.journal_entries je
      WHERE je.org_id = ${org_id}::uuid
        AND je.estado = 'ACTIVO'
        AND je.fecha >= ${desde}::date
        AND je.fecha <= ${hasta}::date
        AND je.tipo_evento = ANY(${eventoTipo}::text[])
    ),
    iva_lines AS (
      SELECT jel.journal_entry_id,
        SUM(jel.debe + jel.haber) AS monto_iva
      FROM accounting.journal_entry_lines jel
      INNER JOIN accounting.chart_of_accounts coa ON coa.id = jel.cuenta_id
      WHERE coa.account_code = ${ivaCuentaCodigo}
      GROUP BY jel.journal_entry_id
    ),
    neto_lines AS (
      SELECT jel.journal_entry_id,
        SUM(jel.debe + jel.haber) AS monto_neto
      FROM accounting.journal_entry_lines jel
      INNER JOIN accounting.chart_of_accounts coa ON coa.id = jel.cuenta_id
      WHERE coa.account_code != ${ivaCuentaCodigo}
        AND coa.account_code != 'AR_DEUDORES_VENTAS'
        AND coa.account_code != 'AP_PROVEEDORES'
      GROUP BY jel.journal_entry_id
    )
    SELECT
      a.fecha::text                                              AS fecha,
      a.tipo_evento,
      CASE
        WHEN a.referencia_tabla = 'purchase_orders' THEN COALESCE(
          NULLIF(po.remittance_number, ''),
          CASE
            WHEN po.purchase_number IS NOT NULL THEN 'Compra ' || po.purchase_number::text
            ELSE NULL
          END,
          a.referencia_id::text
        )
        WHEN a.referencia_tabla = 'sales_orders' THEN COALESCE(
          NULLIF(so.invoice_number, ''),
          NULLIF(so.remittance_number, ''),
          CASE
            WHEN so.sale_number IS NOT NULL THEN 'Venta ' || so.sale_number::text
            ELSE NULL
          END,
          a.referencia_id::text
        )
        WHEN a.referencia_tabla = 'credit_notes' THEN COALESCE(
          NULLIF(cn.credit_note_number, ''),
          a.referencia_id::text
        )
        WHEN a.referencia_tabla IS NOT NULL THEN
          a.referencia_tabla || ' ' || LEFT(a.referencia_id::text, 8)
        ELSE NULL
      END                                                        AS referencia,
      COALESCE(nl.monto_neto, 0)::text                          AS neto_gravado,
      COALESCE(il.monto_iva,  0)::text                          AS iva,
      (COALESCE(nl.monto_neto, 0) + COALESCE(il.monto_iva, 0))::text AS total,
      a.id                                                       AS journal_entry_id
    FROM asientos a
    LEFT JOIN iva_lines  il ON il.journal_entry_id = a.id
    LEFT JOIN neto_lines nl ON nl.journal_entry_id = a.id
    LEFT JOIN public.purchase_orders po ON po.id::text = a.referencia_id::text
    LEFT JOIN public.sales_orders so ON so.id::text = a.referencia_id::text
    LEFT JOIN public.credit_notes cn ON cn.id::text = a.referencia_id::text
    ORDER BY a.fecha ASC, a.id ASC
  `.execute(db);

  return { tipo, rows: rows.rows };
}

const IVA_COLUMNS = [
  { header: "Fecha", key: "fecha", width: 12 },
  { header: "Tipo", key: "tipo_evento", width: 22 },
  { header: "Comprobante", key: "referencia", width: 22 },
  {
    header: "Neto Gravado",
    key: "neto_gravado",
    width: 16,
    numFmt: "#,##0.0000",
  },
  { header: "IVA", key: "iva", width: 14, numFmt: "#,##0.0000" },
  { header: "Total", key: "total", width: 14, numFmt: "#,##0.0000" },
];

export async function exportIVAExcel(params: IVAQuery): Promise<Buffer> {
  const result = await queryLibroIVA(params);
  return buildWorkbook([
    {
      sheetName: params.tipo === "compras" ? "IVA Compras" : "IVA Ventas",
      columns: IVA_COLUMNS,
      rows: result.rows,
    },
  ]);
}

export async function exportIVA(
  params: IVAQuery,
  format: Exclude<LibroExportFormat, "json" | "xlsx">
): Promise<Buffer> {
  const result = await queryLibroIVA(params);
  return buildDelimitedFile(
    IVA_COLUMNS,
    result.rows,
    format === "csv" ? "," : "\t"
  );
}
