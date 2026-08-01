import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import type { DebitNote, DebitNoteStatus } from "@/modules/debit-notes/types";

const STATUS_LABELS: Record<DebitNoteStatus, string> = {
  draft: "Borrador",
  pending: "Emitiendo",
  verifying: "Verificando",
  authorized: "Autorizada",
  error: "Error",
};
const REASON_LABELS: Record<string, string> = {
  INTEREST: "Interés",
  FREIGHT_OR_POST_CHARGE: "Flete/cargo",
  PRICE_DIFFERENCE: "Diferencia de precio",
  OTHER: "Otro",
};

export function DebitNotesTable({
  orgSlug,
  debitNotes,
}: {
  orgSlug: string;
  debitNotes: DebitNote[];
}) {
  if (debitNotes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
        Todavía no hay Notas de Débito.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-muted-foreground">
          <tr>
            <th className="p-3">Número</th>
            <th className="p-3">Cliente</th>
            <th className="p-3">Motivo</th>
            <th className="p-3">Fecha</th>
            <th className="p-3 text-right">Importe</th>
            <th className="p-3">Estado</th>
          </tr>
        </thead>
        <tbody>
          {debitNotes.map((note) => (
            <tr className="border-t" key={note.id}>
              <td className="p-3 font-mono">
                <Link
                  className="hover:underline"
                  href={`/org/${orgSlug}/notas-de-debito/${note.id}`}
                >
                  {note.arcaPointOfSale && note.arcaVoucherNumber
                    ? `${String(note.arcaPointOfSale).padStart(4, "0")}-${String(note.arcaVoucherNumber).padStart(8, "0")}`
                    : note.debitNoteNumber}
                </Link>
              </td>
              <td className="p-3">
                {note.customer?.fantasyName ??
                  note.customer?.businessName ??
                  "—"}
              </td>
              <td className="p-3">{REASON_LABELS[note.reason]}</td>
              <td className="p-3">{formatDateOnly(note.issueDate)}</td>
              <td className="p-3 text-right font-medium">
                {formatCurrency(note.amount)}
              </td>
              <td className="p-3">
                <Badge variant="outline">{STATUS_LABELS[note.status]}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
