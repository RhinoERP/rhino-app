import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { DebitNote } from "@/modules/debit-notes/types";

export function DebitNotesCard({
  orgSlug,
  debitNotes,
}: {
  orgSlug: string;
  debitNotes: DebitNote[];
}) {
  if (debitNotes.length === 0) {
    return null;
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Notas de Débito{" "}
          <span className="text-muted-foreground">({debitNotes.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {debitNotes.map((note) => (
          <div
            className="flex items-center justify-between gap-3"
            key={note.id}
          >
            <Link
              className="font-mono hover:underline"
              href={`/org/${orgSlug}/notas-de-debito/${note.id}`}
            >
              ND {note.debitNoteNumber}
            </Link>
            <span>{formatCurrency(note.amount)}</span>
            <span className="text-muted-foreground">{note.status}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
