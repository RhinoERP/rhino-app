import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DebitNoteDetailView } from "@/components/debit-notes/debit-note-detail-view";
import { getDebitNoteById } from "@/modules/debit-notes/service/debit-notes.service";

type DebitNoteDetailPageProps = {
  params: Promise<{ orgSlug: string; debitNoteId: string }>;
};

export const dynamic = "force-dynamic";

export default async function DebitNoteDetailPage({
  params,
}: DebitNoteDetailPageProps) {
  noStore();

  const { orgSlug, debitNoteId } = await params;
  const debitNote = await getDebitNoteById(orgSlug, debitNoteId);

  if (!debitNote) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          className="text-muted-foreground text-sm hover:text-foreground"
          href={`/org/${orgSlug}/notas-de-debito`}
        >
          Notas de Débito
        </Link>
        <span className="text-muted-foreground text-sm">/</span>
        <span className="font-medium text-sm">
          {debitNote.debitNoteNumber ?? debitNoteId}
        </span>
      </div>
      <DebitNoteDetailView debitNote={debitNote} orgSlug={orgSlug} />
    </div>
  );
}
