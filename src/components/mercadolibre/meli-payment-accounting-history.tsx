import { listMeliPaymentJournalEntries } from "@/modules/mercadolibre/service/meli-accounting-drafts.service";
import type { listMeliPaymentPreparations } from "@/modules/mercadolibre/service/meli-payment-preparations.service";
import { reviewMeliPaymentDispatches } from "@/modules/mercadolibre/utils/accounting-payment-reconciliation";

export async function MeliPaymentAccountingHistory({
  orgSlug,
  paymentId,
  preparations,
}: {
  orgSlug: string;
  paymentId: string;
  preparations?: Awaited<ReturnType<typeof listMeliPaymentPreparations>>;
}) {
  let entries: Awaited<ReturnType<typeof listMeliPaymentJournalEntries>>;
  try {
    entries = await listMeliPaymentJournalEntries(orgSlug, paymentId);
  } catch {
    return (
      <p className="text-destructive" role="alert">
        No se pudo consultar la historia contable de este cobro. Actualizá la
        página o contactá al administrador; no se puede determinar si existen
        asientos.
      </p>
    );
  }

  const issues = preparations
    ? reviewMeliPaymentDispatches(entries, preparations)
    : null;
  return (
    <>
      {issues && issues.length > 0 && (
        <div className="mt-2 text-destructive" role="alert">
          <p>La comparación de envíos y asientos requiere revisión:</p>
          <ul className="list-disc pl-5">
            {issues.map((issue) => (
              <li key={issue.key}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}
      <details>
        <summary className="cursor-pointer font-medium">
          Asientos vinculados al cobro
        </summary>
        {entries.length === 0 ? (
          <p className="mt-2 text-muted-foreground">
            No se encontraron asientos con este cobro como origen. Los asientos
            externos o vinculados a otro origen requieren revisión manual.
          </p>
        ) : (
          <>
            <p className="mt-2 text-muted-foreground">
              Esta consulta no confirma que la liquidación esté completa.
            </p>
            <ul className="mt-2 space-y-2">
              {entries.map((entry) => (
                <li className="break-all" key={entry.id}>
                  {entry.tipo_evento === "CONTRA_ASIENTO"
                    ? "Contra-asiento"
                    : (entry.tipo_evento ?? "Asiento sin tipo")}
                  {" · "}
                  {entry.estado} · fecha {entry.fecha} · ID {entry.id}
                  {entry.tipo_evento === "CONTRA_ASIENTO" && (
                    <p>Asiento original: {entry.referencia_id}</p>
                  )}
                  {entry.anulado_por_id && (
                    <p>Vinculado a reversión: {entry.anulado_por_id}</p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </details>
    </>
  );
}
