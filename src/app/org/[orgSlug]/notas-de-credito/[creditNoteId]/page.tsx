import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreditNoteDetailView } from "@/components/credit-notes/credit-note-detail-view";
import { getCreditNoteById } from "@/modules/credit-notes/service/credit-notes.service";

type CreditNoteDetailPageProps = {
  params: Promise<{ orgSlug: string; creditNoteId: string }>;
};

export const dynamic = "force-dynamic";

export default async function CreditNoteDetailPage({
  params,
}: CreditNoteDetailPageProps) {
  noStore();

  const { orgSlug, creditNoteId } = await params;
  const creditNote = await getCreditNoteById(orgSlug, creditNoteId);

  if (!creditNote) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          className="text-muted-foreground text-sm hover:text-foreground"
          href={`/org/${orgSlug}/notas-de-credito`}
        >
          Notas de Crédito
        </Link>
        <span className="text-muted-foreground text-sm">/</span>
        <span className="font-medium text-sm">
          {creditNote.creditNoteNumber ?? creditNoteId}
        </span>
      </div>
      <CreditNoteDetailView creditNote={creditNote} orgSlug={orgSlug} />
    </div>
  );
}
