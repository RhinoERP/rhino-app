import { z } from "zod";

export const PURCHASE_HISTORY_TYPES = {
  FC: "Factura",
  NC: "Nota de crédito",
  ND: "Nota de débito",
  ME: "Minuta de egreso",
  MI: "Minuta de ingreso",
} as const;

export const purchaseHistoryFiltersSchema = z
  .object({
    search: z.string().trim().max(100).optional(),
    documentCode: z.enum(["FC", "NC", "ND", "ME", "MI"]).optional(),
    dateFrom: z.iso.date().optional(),
    dateTo: z.iso.date().optional(),
    sort: z
      .array(
        z.object({
          id: z.enum(["document_date", "document_number"]),
          desc: z.boolean(),
        })
      )
      .max(2)
      .optional(),
  })
  .refine(
    (filters) =>
      !(filters.dateFrom && filters.dateTo) ||
      filters.dateFrom <= filters.dateTo,
    { message: "Rango de fechas inválido" }
  );
export type PurchaseHistoryFilters = z.infer<
  typeof purchaseHistoryFiltersSchema
>;
export type PurchaseHistoryDocument = {
  id: string;
  source_key: string;
  company_code: string;
  branch_code: string;
  document_code: keyof typeof PURCHASE_HISTORY_TYPES;
  document_letter: string;
  document_series: number;
  document_number: number;
  printed_number: string;
  supplier_chess_code: string;
  supplier_name: string;
  document_date: string;
  tax_date: string | null;
  debt_sign: number;
  purchase_sign: number;
  is_fiscal: boolean;
  is_mipyme: boolean;
  currency: string;
  exchange_rate: number;
  gross_amount: number;
  discount_amount: number;
  non_taxable_amount: number;
  net_taxable_amount: number;
  vat_amount: number;
  internal_tax_amount: number;
  perception_iibb_amount: number;
  perception_3337_amount: number;
  perception_5329_amount: number;
  municipal_tax_amount: number;
  total_amount: number;
  payment_methods: string[];
  payment_order_references: string[];
};
export type PurchaseHistoryItem = {
  id: string;
  source_row: number;
  row_kind: "ARTICLE" | "ACCOUNTING";
  product_chess_code: string | null;
  description: string;
  concept: string;
  boxes: number;
  units: number;
  units_per_box: number | null;
  base_unit_quantity: number | null;
  unit_price: number;
  discount_percentage: number;
  net_amount: number;
  vat_rate: number;
  vat_amount: number;
  subtotal: number;
  cost_center: string;
  expense: string;
  category: string;
  raw_data: Record<string, string | number | null>;
};
export function historyDate(value: string | null) {
  return value
    ? new Date(`${value}T00:00:00Z`).toLocaleDateString("es-AR", {
        timeZone: "UTC",
      })
    : "—";
}

export function historyAmount(value: number, currency = "ARS") {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(
    Number(value)
  );
}

export function historyClassification(document: PurchaseHistoryDocument) {
  if (document.is_mipyme) {
    return "Fiscal · MiPyME";
  }
  return document.is_fiscal
    ? `Fiscal · ${document.document_letter}`
    : "No fiscal";
}

function quote(value: string) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function purchaseHistorySearch(search: string) {
  const pattern = quote(`%${search}%`);
  return [
    `supplier_name.ilike.${pattern}`,
    `supplier_chess_code.eq.${quote(search)}`,
    `printed_number.ilike.${pattern}`,
    `document_code.ilike.${pattern}`,
  ].join(",");
}

export function purchaseHistoryExportRows(
  documents: PurchaseHistoryDocument[]
) {
  return documents.map((doc) => [
    historyDate(doc.document_date),
    doc.printed_number,
    PURCHASE_HISTORY_TYPES[doc.document_code],
    doc.supplier_chess_code,
    doc.supplier_name,
    historyClassification(doc),
    doc.currency,
    Number(doc.total_amount),
    Math.abs(Number(doc.total_amount)) * doc.debt_sign,
    Math.abs(Number(doc.total_amount)) * doc.purchase_sign,
    doc.payment_order_references.join("; "),
    "Sin conciliar",
  ]);
}

// Small server-action responses avoid sending the entire archive in one payload.
// Nothing is downloaded until every batch has completed successfully.
export async function collectPurchaseHistoryExport(
  fetchPage: (
    offset: number
  ) => Promise<{ data: PurchaseHistoryDocument[]; totalCount: number }>
) {
  const documents: PurchaseHistoryDocument[] = [];
  let expectedCount: number | undefined;
  for (;;) {
    const page = await fetchPage(documents.length);
    expectedCount ??= page.totalCount;
    if (
      page.totalCount !== expectedCount ||
      (page.data.length === 0 && documents.length < expectedCount)
    ) {
      throw new Error(
        "El historial cambió o la exportación quedó incompleta. Intentá nuevamente."
      );
    }
    documents.push(...page.data);
    if (documents.length === expectedCount) {
      return documents;
    }
    if (documents.length > expectedCount) {
      throw new Error("La cantidad exportada no coincide con el historial");
    }
  }
}
