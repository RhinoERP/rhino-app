import { CreateDebitNoteDialog } from "@/components/debit-notes/create-debit-note-dialog";
import { DebitNotesTable } from "@/components/debit-notes/debit-notes-table";
import { getDebitNotesByOrgSlug } from "@/modules/debit-notes/service/debit-notes.service";
import { getOrganizationLayoutData } from "@/modules/organizations/service/organizations.service";
import {
  getSalesAccessContext,
  getSalesOrdersByOrgSlug,
} from "@/modules/sales/service/sales.service";
import { getActiveTaxesByOrgSlug } from "@/modules/taxes/service/taxes.service";

export const dynamic = "force-dynamic";

export default async function DebitNotesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const [debitNotes, sales, access, layout, taxes] = await Promise.all([
    getDebitNotesByOrgSlug(orgSlug),
    getSalesOrdersByOrgSlug(orgSlug),
    getSalesAccessContext(orgSlug),
    getOrganizationLayoutData(orgSlug),
    getActiveTaxesByOrgSlug(orgSlug),
  ]);
  const canManageDebitNotes =
    layout?.permissions.includes("organization.admin") ||
    (access.canManage &&
      ["debitnotes.manage", "sales.read", "arca.read"].every((permission) =>
        layout?.permissions.includes(permission)
      ));
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-heading text-2xl">Notas de Débito</h1>
          <p className="text-muted-foreground text-sm">
            Cargos fiscales adicionales asociados a facturas autorizadas.
          </p>
        </div>
        {canManageDebitNotes ? (
          <CreateDebitNoteDialog
            orgSlug={orgSlug}
            sales={sales}
            taxes={taxes}
          />
        ) : null}
      </div>
      <DebitNotesTable debitNotes={debitNotes} orgSlug={orgSlug} />
    </div>
  );
}
