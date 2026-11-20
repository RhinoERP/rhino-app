import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getChessHistoricalSalesReference } from "@/modules/sales/historical/service/chess-historical-sales.service";

type HistoricalReferencePageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ key?: string }>;
};

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("es-AR", {
    timeZone: "UTC",
  });
}

export default async function HistoricalReferencePage({
  params,
  searchParams,
}: HistoricalReferencePageProps) {
  const [{ orgSlug }, query] = await Promise.all([params, searchParams]);
  if (!query.key) {
    notFound();
  }

  const reference = await getChessHistoricalSalesReference(orgSlug, query.key);
  if (!reference) {
    notFound();
  }

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-sm">
            Ventas históricas / CHESS
          </p>
          <h1 className="font-heading text-2xl">
            {reference.target_printed_number ||
              `${reference.target_document_code} ${reference.target_letter} ${reference.target_series}-${reference.target_number}`}
          </h1>
          <p className="text-muted-foreground text-sm">
            {reference.target_document_name || "Comprobante relacionado"}
            {reference.target_relation_type
              ? ` · Relación CHESS: ${reference.target_relation_type}`
              : ""}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/org/${orgSlug}/ventas/historicas`}>
            Volver al historial
          </Link>
        </Button>
      </div>

      <section className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-3">
        <div>
          <p className="text-muted-foreground text-xs">Tipo</p>
          <p className="font-medium">{reference.target_document_code}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">
            Fecha informada por CHESS
          </p>
          <p className="font-medium">
            {formatDate(reference.target_document_date)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Clave CHESS</p>
          <p className="break-all font-mono text-xs">
            {reference.target_source_key}
          </p>
        </div>
      </section>

      {reference.related_lines.length > 0 ? (
        <section className="space-y-3 rounded-lg border bg-card p-4">
          <h2 className="font-semibold">Artículos señalados por el vínculo</h2>
          <ul className="space-y-2 text-sm">
            {reference.related_lines.map((line) => (
              <li
                className="border-b pb-2 last:border-0 last:pb-0"
                key={`${line.line_number ?? ""}-${line.product_chess_code ?? ""}-${line.description ?? ""}`}
              >
                {line.product_chess_code ? `${line.product_chess_code} · ` : ""}
                {line.description || "Línea sin descripción"}
                {line.line_number ? ` (línea ${line.line_number})` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="rounded-md border p-3 text-muted-foreground text-sm">
          CHESS informó la relación con este documento, pero no devolvió sus
          líneas completas en el comprobante de origen.
        </p>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">
          Comprobantes que apuntan a esta referencia
        </h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Comprobante origen</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
              </tr>
            </thead>
            <tbody>
              {reference.source_documents.map((document) => (
                <tr className="border-t" key={document.id}>
                  <td className="px-4 py-3">
                    <Link
                      className="font-medium text-primary hover:underline"
                      href={`/org/${orgSlug}/ventas/historicas/${document.id}`}
                    >
                      {document.printed_number || document.document_code}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {formatDate(document.document_date)}
                  </td>
                  <td className="px-4 py-3">{document.document_name}</td>
                </tr>
              ))}
              {reference.source_documents.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-8 text-center text-muted-foreground"
                    colSpan={3}
                  >
                    No hay comprobantes cargados que apunten a esta referencia.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
