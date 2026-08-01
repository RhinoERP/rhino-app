import Link from "next/link";
import { notFound } from "next/navigation";
import { DebitNoteDetailView } from "@/components/debit-notes/debit-note-detail-view";
import { getDebitNoteById } from "@/modules/debit-notes/service/debit-notes.service";
import { getOrganizationLayoutData } from "@/modules/organizations/service/organizations.service";

export const dynamic = "force-dynamic";

export default async function DebitNoteDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; debitNoteId: string }>;
}) {
  const { orgSlug, debitNoteId } = await params;
  const [debitNote, layout] = await Promise.all([
    getDebitNoteById(orgSlug, debitNoteId),
    getOrganizationLayoutData(orgSlug),
  ]);
  if (!debitNote) {
    notFound();
  }
  return (
    <div className="space-y-6">
      <Link
        className="text-muted-foreground text-sm hover:text-foreground"
        href={`/org/${orgSlug}/notas-de-debito`}
      >
        Notas de Débito
      </Link>
      <DebitNoteDetailView
        canManage={Boolean(
          layout?.permissions.includes("organization.admin") ||
            ["debitnotes.manage", "sales.read", "arca.read"].every(
              (permission) => layout?.permissions.includes(permission)
            )
        )}
        debitNote={debitNote}
        orgSlug={orgSlug}
      />
    </div>
  );
}
