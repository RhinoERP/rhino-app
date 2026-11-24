import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  type ChessHistoricalSalesLink,
  getChessHistoricalSalesDetail,
} from "@/modules/sales/historical/service/chess-historical-sales.service";

type HistoricalSalesDetailPageProps = {
  params: Promise<{ orgSlug: string; documentId: string }>;
};

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("es-AR", {
    timeZone: "UTC",
  });
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
  }).format(Number(value));
}

function formatOptionalAmount(value: number | null) {
  return value == null ? "—" : formatAmount(value);
}

function documentClassLabel(documentClass: string, isFiscal: boolean) {
  let typeLabel = "Venta";
  if (documentClass === "CREDIT_NOTE") {
    typeLabel = "Nota de crédito";
  } else if (documentClass === "DEBIT_NOTE") {
    typeLabel = "Nota de débito";
  }
  return `${isFiscal ? "Fiscal" : "No fiscal"} · ${typeLabel}`;
}

function settlementLabel(status: string, cancelled: boolean) {
  if (cancelled) {
    return "Anulado";
  }
  if (status === "PAID") {
    return "Pagado";
  }
  if (status === "OPEN") {
    return "Abierto";
  }
  if (status === "PARTIAL") {
    return "Parcial";
  }
  if (status === "NOT_APPLICABLE") {
    return "No aplica";
  }
  return "Saldo sin conciliar";
}

function RelatedDocumentLink({
  orgSlug,
  link,
}: {
  orgSlug: string;
  link: ChessHistoricalSalesLink;
}) {
  const href = link.target_document_id
    ? `/org/${orgSlug}/ventas/historicas/${link.target_document_id}`
    : `/org/${orgSlug}/ventas/historicas/referencia?key=${encodeURIComponent(link.target_source_key)}`;
  const printedNumber =
    link.target_printed_number ||
    `${link.target_document_code} ${link.target_letter} ${link.target_series}-${link.target_number}`;
  const relationLabel =
    link.relation_type === "CREDIT_NOTE_TO_DOCUMENT"
      ? "Nota vinculada a:"
      : "Relacionado con:";

  return (
    <li
      className="flex flex-wrap items-center gap-x-2"
      key={`${link.target_source_key}|${link.relation_type}`}
    >
      <span>{relationLabel}</span>
      <Link className="font-medium text-primary hover:underline" href={href}>
        {printedNumber}
      </Link>
      <span className="text-muted-foreground">
        {link.target_document_name || "Referencia CHESS"}
        {link.target_document_date
          ? ` · ${formatDate(link.target_document_date)}`
          : ""}
      </span>
      {link.related_lines.length > 0 ? (
        <details className="basis-full pl-4 text-muted-foreground">
          <summary className="cursor-pointer">
            {link.related_lines.length} artículos/líneas relacionados
          </summary>
          <ul className="mt-1 space-y-1">
            {link.related_lines.map((line) => (
              <li
                key={`${line.line_number ?? ""}-${line.product_chess_code ?? ""}-${line.description ?? ""}`}
              >
                {line.product_chess_code ? `${line.product_chess_code} · ` : ""}
                {line.description || "Línea sin descripción"}
                {line.line_number ? ` (línea ${line.line_number})` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}

export default async function HistoricalSalesDetailPage({
  params,
}: HistoricalSalesDetailPageProps) {
  const { orgSlug, documentId } = await params;
  const result = await getChessHistoricalSalesDetail(orgSlug, documentId);
  if (!result) {
    notFound();
  }

  const { document, items, links } = result;
  const signedTotal = Number(document.total_amount) * document.revenue_sign;
  const customerName =
    document.customer?.fantasy_name ||
    document.customer?.business_name ||
    `Cliente CHESS ${document.customer_chess_code ?? "sin vincular"}`;
  const documentAmounts = [
    ["Bruto", document.gross_amount],
    ["Bonificación", document.discount_amount],
    ["Neto gravado", document.net_taxable_amount],
    ["Neto otros", document.net_other_amount],
    ["No gravado", document.non_taxable_amount],
    ["Exento", document.exempt_amount],
    ["IVA 1", document.vat_1_amount],
    ["IVA 1 fiscal", document.vat_1_fiscal_amount],
    ["IVA 2", document.vat_2_amount],
    ["Percepción 2,12", document.perception_212_amount],
    ["Percepción 3,337", document.perception_3337_amount],
    ["Percepción IIBB", document.perception_iibb_amount],
    ["Impuestos internos", document.internal_tax_amount],
    ["Detracción", document.detraccion_amount],
  ] as const;

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-sm">
            <Link
              className="hover:underline"
              href={`/org/${orgSlug}/ventas/historicas`}
            >
              Ventas históricas
            </Link>
          </p>
          <h1 className="font-heading text-2xl">
            {document.printed_number ||
              `${document.document_letter} ${document.document_series}-${document.document_number}`}
          </h1>
          <p className="text-muted-foreground text-sm">
            {document.document_code} · {document.document_name}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/org/${orgSlug}/ventas/historicas`}>
            Volver al historial
          </Link>
        </Button>
      </div>

      {document.is_reference_only ? (
        <p className="rounded-md border p-3 text-muted-foreground text-sm">
          Comprobante original fuera del período, incluido para consultar su
          relación con una nota de crédito. No se suma a las métricas del
          piloto.
        </p>
      ) : null}

      <section className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <p className="text-muted-foreground text-xs">Cliente</p>
          <p className="font-medium">{customerName}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Fecha</p>
          <p className="font-medium">{formatDate(document.document_date)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Tipo</p>
          <p className="font-medium">
            {documentClassLabel(document.document_class, document.is_fiscal)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">
            Importe con signo comercial
          </p>
          <p className="font-medium tabular-nums">
            {formatAmount(signedTotal)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Estado de cuenta</p>
          <p className="font-medium">
            {settlementLabel(document.settlement_status, document.cancelled)}
          </p>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <div>
          <h2 className="font-semibold">Impuestos y descuentos</h2>
          <p className="text-muted-foreground text-sm">
            Desglose original informado por CHESS. El importe con signo
            comercial se muestra en el resumen del comprobante.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {documentAmounts.map(([label, value]) => (
            <div className="rounded-md bg-muted/30 p-3" key={label}>
              <p className="text-muted-foreground text-xs">{label}</p>
              <p className="font-medium tabular-nums">
                {formatOptionalAmount(value)}
              </p>
            </div>
          ))}
          <div className="rounded-md bg-muted/30 p-3">
            <p className="text-muted-foreground text-xs">Total</p>
            <p className="font-medium tabular-nums">
              {formatAmount(Number(document.total_amount))}
            </p>
          </div>
        </div>
      </section>

      {links.length > 0 ? (
        <section className="space-y-3 rounded-lg border bg-card p-4">
          <h2 className="font-semibold">Comprobantes relacionados</h2>
          <ul className="space-y-2 text-sm">
            {links.map((link) => (
              <RelatedDocumentLink
                key={`${link.target_source_key}|${link.relation_type}`}
                link={link}
                orgSlug={orgSlug}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {document.document_class === "CREDIT_NOTE" && links.length === 0 ? (
        <p className="rounded-md border p-3 text-muted-foreground text-sm">
          CHESS no informó un comprobante original relacionado con esta nota de
          crédito. El vínculo queda sin verificar.
        </p>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Artículos</h2>
          <span className="text-muted-foreground text-sm">
            {items.length} líneas
          </span>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Artículo</th>
                <th className="px-4 py-3 text-right font-medium">Bultos</th>
                <th className="px-4 py-3 text-right font-medium">
                  Unidades sueltas
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  Unidades totales
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  Precio CHESS
                </th>
                <th className="px-4 py-3 text-right font-medium">Bruto</th>
                <th className="px-4 py-3 text-right font-medium">Bonif. %</th>
                <th className="px-4 py-3 text-right font-medium">
                  Bonificación
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  Neto gravado
                </th>
                <th className="px-4 py-3 text-right font-medium">IVA 1</th>
                <th className="px-4 py-3 text-right font-medium">IVA 2</th>
                <th className="px-4 py-3 text-right font-medium">Importe</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr className="border-t" key={item.id}>
                  <td className="px-4 py-3 tabular-nums">
                    {item.product_chess_code || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <p>
                      {item.description ||
                        item.product?.name ||
                        "Artículo sin descripción"}
                    </p>
                    {item.generic_merchandise ? (
                      <p className="text-muted-foreground text-xs">
                        Importe genérico sin SKU asignado
                      </p>
                    ) : null}
                    {item.units_per_box != null ? (
                      <p className="text-muted-foreground text-xs">
                        {Number(item.units_per_box).toLocaleString("es-AR")}{" "}
                        unidades por bulto
                      </p>
                    ) : null}
                    <details className="mt-1 text-muted-foreground text-xs">
                      <summary className="cursor-pointer">
                        Otros impuestos y cargos
                      </summary>
                      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                        <span>
                          No gravado:{" "}
                          {formatOptionalAmount(item.non_taxable_amount)}
                        </span>
                        <span>
                          Exento: {formatOptionalAmount(item.exempt_amount)}
                        </span>
                        <span>
                          Percepción 2,12:{" "}
                          {formatOptionalAmount(item.perception_212_amount)}
                        </span>
                        <span>
                          Percepción 3,337:{" "}
                          {formatOptionalAmount(item.perception_3337_amount)}
                        </span>
                        <span>
                          IIBB:{" "}
                          {formatOptionalAmount(item.perception_iibb_amount)}
                        </span>
                        <span>
                          Impuestos internos:{" "}
                          {formatOptionalAmount(item.internal_tax_amount)}
                        </span>
                        <span>
                          Detracción:{" "}
                          {formatOptionalAmount(item.detraccion_amount)}
                        </span>
                        <span>
                          Flete: {formatOptionalAmount(item.freight_amount)}
                        </span>
                        <span>
                          Precio final: {formatOptionalAmount(item.final_price)}
                        </span>
                      </div>
                    </details>
                    {item.cancelled ? (
                      <p className="text-amber-700 text-xs">
                        Línea anulada en CHESS
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {(
                      Number(item.quantity) * document.revenue_sign
                    ).toLocaleString("es-AR")}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {(
                      Number(item.remainder_quantity) * document.revenue_sign
                    ).toLocaleString("es-AR")}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {item.base_unit_quantity == null
                      ? "—"
                      : (
                          Number(item.base_unit_quantity) *
                          document.revenue_sign
                        ).toLocaleString("es-AR")}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatAmount(Number(item.unit_price))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatOptionalAmount(item.gross_amount)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatAmount(Number(item.discount_percentage))}%
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatAmount(Number(item.discount_amount))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatAmount(Number(item.net_amount))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatAmount(Number(item.tax_iva_1))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatAmount(Number(item.tax_iva_2))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatAmount(
                      Number(item.total_amount) * document.revenue_sign
                    )}
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-8 text-center text-muted-foreground"
                    colSpan={13}
                  >
                    Este comprobante no tiene líneas de artículos disponibles.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {document.cancelled ? (
          <p className="text-amber-700 text-sm">
            El comprobante figura anulado en CHESS.
          </p>
        ) : null}
      </section>
    </main>
  );
}
