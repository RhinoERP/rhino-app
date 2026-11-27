import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  historyAmount,
  historyClassification,
  historyDate,
  PURCHASE_HISTORY_TYPES,
  type PurchaseHistoryDocument,
  type PurchaseHistoryItem,
} from "@/modules/purchases/historical/chess-history";
import { getPurchaseHistoryDetail } from "@/modules/purchases/historical/service/chess-purchase-history.service";

const AMOUNTS: { key: keyof PurchaseHistoryDocument; label: string }[] = [
  { key: "gross_amount", label: "Bruto" },
  { key: "discount_amount", label: "Bonificación" },
  { key: "non_taxable_amount", label: "No gravado" },
  { key: "net_taxable_amount", label: "Neto gravado" },
  { key: "vat_amount", label: "IVA" },
  { key: "internal_tax_amount", label: "Impuestos internos" },
  { key: "perception_iibb_amount", label: "Percepción IIBB" },
  { key: "perception_3337_amount", label: "Percepción 3337" },
  { key: "perception_5329_amount", label: "Percepción 5329" },
  { key: "municipal_tax_amount", label: "Percepción municipal" },
  { key: "total_amount", label: "Total original" },
];

function SourceRow({
  item,
  currency,
}: {
  item: PurchaseHistoryItem;
  currency: string;
}) {
  return (
    <tr className="border-t">
      <td className="px-3 py-3">{item.source_row}</td>
      <td className="px-3 py-3">
        {item.row_kind === "ARTICLE" ? "Artículo" : "Desglose contable"}
      </td>
      <td className="px-3 py-3">{item.product_chess_code || "—"}</td>
      <td className="min-w-64 px-3 py-3">
        <p>{item.description || item.concept || "Sin descripción"}</p>
        <p className="text-muted-foreground text-xs">
          {[item.expense, item.cost_center, item.category]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            Datos originales del renglón
          </summary>
          <dl className="mt-2 space-y-1">
            {Object.entries(item.raw_data).map(([key, value]) => (
              <div className="flex gap-2" key={key}>
                <dt className="font-medium">{key}:</dt>
                <dd>{String(value ?? "—")}</dd>
              </div>
            ))}
          </dl>
        </details>
      </td>
      <td className="px-3 py-3 text-right">
        {Number(item.boxes).toLocaleString("es-AR")}
      </td>
      <td className="px-3 py-3 text-right">
        {Number(item.units).toLocaleString("es-AR")}
      </td>
      <td className="px-3 py-3 text-right">
        {item.base_unit_quantity == null
          ? "—"
          : Number(item.base_unit_quantity).toLocaleString("es-AR")}
      </td>
      <td className="px-3 py-3 text-right">
        {historyAmount(item.unit_price, currency)}
      </td>
      <td className="px-3 py-3 text-right">
        {Number(item.discount_percentage).toLocaleString("es-AR")}%
      </td>
      <td className="px-3 py-3 text-right">
        {historyAmount(item.net_amount, currency)}
      </td>
      <td className="px-3 py-3 text-right">
        {Number(item.vat_rate).toLocaleString("es-AR")}%
      </td>
      <td className="px-3 py-3 text-right">
        {historyAmount(item.vat_amount, currency)}
      </td>
      <td className="px-3 py-3 text-right">
        {historyAmount(item.subtotal, currency)}
      </td>
    </tr>
  );
}

export default async function PurchaseHistoryDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; documentId: string }>;
}) {
  const { orgSlug, documentId } = await params;
  if (!z.uuid().safeParse(documentId).success) {
    notFound();
  }
  const result = await getPurchaseHistoryDetail(orgSlug, documentId);
  if (!result) {
    notFound();
  }
  const { document, items } = result;
  const debt = Math.abs(Number(document.total_amount)) * document.debt_sign;
  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-sm">
            Históricos / Compras / CHESS
          </p>
          <h1 className="font-heading text-2xl">{document.printed_number}</h1>
          <p className="text-muted-foreground text-sm">
            {PURCHASE_HISTORY_TYPES[document.document_code]} ·{" "}
            {historyClassification(document)}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/org/${orgSlug}/compras/historicas`}>
            Volver al historial
          </Link>
        </Button>
      </div>
      <section className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-muted-foreground text-xs">
            Proveedor · {document.supplier_chess_code}
          </p>
          <p>{document.supplier_name}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">
            Fecha del comprobante / imputación
          </p>
          <p>
            {historyDate(document.document_date)} /{" "}
            {historyDate(document.tax_date)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">
            Movimiento de deuda · {document.currency}
          </p>
          <p>{historyAmount(debt, document.currency)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Estado de cuenta</p>
          <p>Sin conciliar</p>
        </div>
      </section>
      {document.document_code === "MI" ? (
        <p className="rounded-lg border p-3 text-sm">
          La minuta de ingreso reduce deuda y representa un ingreso o saldo a
          favor. Se muestra en el historial, pero no se incluye en las métricas
          de compras.
        </p>
      ) : null}
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="font-semibold">Impuestos y descuentos</h2>
        <p className="text-muted-foreground text-sm">
          Importes originales de la fila de cierre. Los renglones se conservan
          por separado y no duplican el total.
        </p>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {AMOUNTS.map(({ key, label }) => (
            <div className="rounded-md bg-muted/30 p-3" key={key}>
              <p className="text-muted-foreground text-xs">{label}</p>
              <p className="tabular-nums">
                {historyAmount(Number(document[key]), document.currency)}
              </p>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
          Cotización original:{" "}
          {Number(document.exchange_rate).toLocaleString("es-AR")}
        </p>
      </section>
      <section className="space-y-2 rounded-lg border bg-card p-4">
        <h2 className="font-semibold">Referencias de pago</h2>
        <p className="text-muted-foreground text-sm">
          Estas referencias no permiten determinar importes pagados ni saldo
          pendiente.
        </p>
        <p className="break-words text-sm">
          Órdenes de pago:{" "}
          {document.payment_order_references.join("; ") || "Sin referencias"}
        </p>
        <p className="text-sm">
          Forma de pago informada:{" "}
          {document.payment_methods.join("; ") || "Sin informar"}
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">Renglones originales · {items.length}</h2>
        <p className="text-muted-foreground text-sm">
          Artículos y desgloses contables conservados del Excel. La cantidad
          normalizada usa la presentación del maestro CHESS del piloto.
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50">
              <tr>
                {[
                  "Fila Excel",
                  "Renglón",
                  "Código",
                  "Descripción / concepto",
                  "Bultos",
                  "Unidades",
                  "Unidades normalizadas",
                  "Precio",
                  "Bonif. %",
                  "Neto línea",
                  "IVA %",
                  "IVA línea",
                  "Subtotal",
                ].map((label) => (
                  <th className="whitespace-nowrap px-3 py-3" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <SourceRow
                  currency={document.currency}
                  item={item}
                  key={item.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
