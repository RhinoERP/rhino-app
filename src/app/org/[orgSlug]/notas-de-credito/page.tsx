import { unstable_noStore as noStore } from "next/cache";
import { CreateCreditNoteDialog } from "@/components/credit-notes/create-credit-note-dialog";
import { CreditNotesTable } from "@/components/credit-notes/credit-notes-table";
import { getCreditNotesByOrgSlug } from "@/modules/credit-notes/service/credit-notes.service";
import {
  getSalesAccessContext,
  getSalesOrdersByOrgSlug,
} from "@/modules/sales/service/sales.service";

type CreditNotesPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export const dynamic = "force-dynamic";

export default async function CreditNotesPage({
  params,
}: CreditNotesPageProps) {
  noStore();

  const { orgSlug } = await params;

  const [creditNotes, sales, accessContext] = await Promise.all([
    getCreditNotesByOrgSlug(orgSlug),
    getSalesOrdersByOrgSlug(orgSlug),
    getSalesAccessContext(orgSlug),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-heading text-2xl">Notas de Crédito</h1>
          <p className="text-muted-foreground text-sm">
            Documentos de crédito emitidos a clientes por devoluciones o
            ajustes.
          </p>
        </div>
        {accessContext.canManage && (
          <CreateCreditNoteDialog orgSlug={orgSlug} sales={sales} />
        )}
      </div>

      <CreditNotesTable creditNotes={creditNotes} orgSlug={orgSlug} />
    </div>
  );
}
