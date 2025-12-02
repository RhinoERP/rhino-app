import { getOrganizationMembersBySlug } from "@/modules/organizations/service/members.service";
import { columns } from "./columns";
import { DataTable } from "./data-table";

type MiembrosPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function MiembrosPage({ params }: MiembrosPageProps) {
  const { orgSlug } = await params;
  const members = await getOrganizationMembersBySlug(orgSlug);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl">Miembros</h1>
          <p className="text-muted-foreground text-sm">
            Gestiona los miembros de tu organización.
          </p>
        </div>
      </div>

      <DataTable columns={columns} data={members} />
    </div>
  );
}
