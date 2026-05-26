import { unstable_noStore as noStore } from "next/cache";
import { CreateDebitNoteDialog } from "@/components/debit-notes/create-debit-note-dialog";
import { DebitNotesTable } from "@/components/debit-notes/debit-notes-table";
import { getDebitNotesByOrgSlug } from "@/modules/debit-notes/service/debit-notes.service";
import {
  getSalesAccessContext,
  getSalesOrdersByOrgSlug,
} from "@/modules/sales/service/sales.service";

type DebitNotesPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export const dynamic = "force-dynamic";

export default async function DebitNotesPage({ params }: DebitNotesPageProps) {
  noStore();

  const { orgSlug } = await params;

  const [debitNotes, sales, accessContext] = await Promise.all([
    getDebitNotesByOrgSlug(orgSlug),
    getSalesOrdersByOrgSlug(orgSlug),
    getSalesAccessContext(orgSlug),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-heading text-2xl">Notas de Débito</h1>
          <p className="text-muted-foreground text-sm">
            Documentos de débito emitidos a clientes para cobros adicionales o
            ajustes.
          </p>
        </div>
        {accessContext.canManage && (
          <CreateDebitNoteDialog orgSlug={orgSlug} sales={sales} />
        )}
      </div>

      <DebitNotesTable debitNotes={debitNotes} orgSlug={orgSlug} />
    </div>
  );
}
